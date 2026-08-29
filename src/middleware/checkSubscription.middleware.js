const User = require("../models/User");

const checkSubscription = async (req, res, next) => {
  if (req.user.role === "admin") {
    return next();
  }

  const user = await User.findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  // خط دفاع فعلي في الباك اند - حتى لو حد تجاوز شاشة "تحت المراجعة" في
  // الفرونت بأي طريقة (تعديل الكود، نداء الـ API مباشرة...)، السيرفر
  // برضو بيرفض أي عملية طبية حقيقية لحد ما الأدمن يوافق على الحساب
  if (user.verificationStatus !== "approved") {
    return res.status(403).json({
      error: "ACCOUNT_NOT_APPROVED",
      verificationStatus: user.verificationStatus,
      message:
        user.verificationStatus === "rejected"
          ? "Your account registration was rejected."
          : "Your account is still under review by our team.",
    });
  }

  const subscription = user.subscription;

  // Trial
  if (subscription.status === "trial") {
    if (new Date() > subscription.trialEnd) {
      subscription.status = "expired";
      await user.save();

      return res.status(403).json({
        error: "SUBSCRIPTION_EXPIRED",
        message: "Your trial period has expired.",
      });
    }

    return next();
  }

  // Active
  if (subscription.status === "active") {
    if (
      subscription.subscriptionEnd &&
      new Date() > subscription.subscriptionEnd
    ) {
      subscription.status = "expired";
      await user.save();

      return res.status(403).json({
        error: "SUBSCRIPTION_EXPIRED",
        message: "Your subscription has expired.",
      });
    }

    return next();
  }

  // Expired
  return res.status(403).json({
    error: "SUBSCRIPTION_EXPIRED",
    message: "Your subscription has expired.",
  });
};

module.exports = checkSubscription;