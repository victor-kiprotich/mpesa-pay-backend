export default {
  routes: [
    {
      method: "POST",
      path: "/payment/initiate",
      handler: "payment.initiate",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/payment/callback",
      handler: "payment.callback",
      config: { auth: false },
    },
  ],
};
