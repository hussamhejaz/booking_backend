module.exports = (err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
};
