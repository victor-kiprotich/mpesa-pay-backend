import { factories } from "@strapi/strapi";
import axios from "axios";
import moment from "moment";

export default factories.createCoreController("api::payment.payment", ({ strapi }) => ({

  // 📌 Initiate STK Push
  async initiate(ctx) {
    try {
      const { phone, amount } = ctx.request.body;

      // ✅ Generate M-Pesa access token
      const auth = Buffer.from(
        `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
      ).toString("base64");

      const tokenResponse = await axios.get(
        "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        { headers: { Authorization: `Basic ${auth}` } }
      );

      const accessToken = tokenResponse.data.access_token;

      // ✅ Generate timestamp & password
      const timestamp = moment().format("YYYYMMDDHHmmss");
      const password = Buffer.from(
        "174379" + process.env.MPESA_PASSKEY + timestamp
      ).toString("base64");

      // ✅ STK Push request
      const stkResponse = await axios.post(
        "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        {
          BusinessShortCode: "174379",
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: amount,
          PartyA: phone,
          PartyB: "174379", // Paybill/Till
          PhoneNumber: phone,
          CallBackURL: "https://afraid-bees-call.loca.lt/api/payment/callback", // ✅ Updated
          AccountReference: "TestPayment",
          TransactionDesc: "React Payment Demo",
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      // ✅ Save initial transaction to DB
      await strapi.db.query("api::payment.payment").create({
        data: {
          phone,
          amount,
          till: "174379",
          status: "initiated",
          merchantRequestID: stkResponse.data.MerchantRequestID,
          checkoutRequestID: stkResponse.data.CheckoutRequestID,
        },
      });

      return { message: "Payment initiated", response: stkResponse.data };

    } catch (err) {
      console.error("Payment Error:", err.response?.data || err.message);
      ctx.throw(400, err.response?.data || err.message);
    }
  },

  // 📌 Callback from Safaricom
  async callback(ctx) {
    try {
      const data = ctx.request.body;
      console.log("🔔 M-Pesa Callback:", data);

      const { Body } = data;

      if (Body?.stkCallback) {
        const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = Body.stkCallback;

        // ✅ Update payment in DB
        await strapi.db.query("api::payment.payment").updateMany({
          where: { checkoutRequestID: CheckoutRequestID },
          data: {
            status: ResultCode === 0 ? "success" : "failed",
            mpesaResponse: JSON.stringify(Body.stkCallback),
            resultDescription: ResultDesc,
          },
        });
      }

      return { message: "Callback received" };
    } catch (err) {
      console.error("Callback Error:", err.message);
      ctx.throw(400, err.message);
    }
  },

}));
