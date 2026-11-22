import { ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const authBaseUrl = process.env.BETTER_AUTH_URL;

if (!authBaseUrl) {
  throw new Error("BETTER_AUTH_URL is missing!");
}

// Trailing slash বাদ দিয়ে normalize — যাতে iss/aud হুবহু মেলে।
const normalizedAuthBaseUrl = authBaseUrl.replace(/\/+$/, "");

// Better Auth-এর public JWKS। কোনো secret/private key এখানে লাগে না।
const jwks = createRemoteJWKSet(
  new URL("/api/auth/jwks", normalizedAuthBaseUrl),
);

/**
 * `verifyToken` middleware বানায়, যেটি Better Auth-এর JWT যাচাই করে
 * এবং MongoDB-র `user` কালেকশন থেকে trusted user এনে `req.user` সেট করে।
 *
 * `userCollection` ইনজেক্ট করা হয়, যাতে index.js-এর বিদ্যমান MongoDB
 * connection-টাই পুনরায় ব্যবহার হয় (নতুন connection তৈরি হয় না)।
 *
 * index.js-এ ব্যবহার (Step 6):
 *   const verifyToken = createVerifyToken(db.collection("user"));
 */
function createVerifyToken(userCollection) {
  return async function verifyToken(req, res, next) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res
        .status(401)
        .send({ message: "Unauthorized: missing bearer token" });
    }

    const token = header.slice("Bearer ".length).trim();

    if (!token) {
      return res
        .status(401)
        .send({ message: "Unauthorized: malformed bearer token" });
    }

    // 1) JWT verify: signature + exp + iss + aud + EdDSA
    let subject;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: normalizedAuthBaseUrl,
        audience: normalizedAuthBaseUrl,
        algorithms: ["EdDSA"],
      });
      subject = payload.sub;
    } catch {
      return res
        .status(401)
        .send({ message: "Unauthorized: invalid or expired token" });
    }

    if (!subject) {
      return res
        .status(401)
        .send({ message: "Unauthorized: invalid token subject" });
    }

    // 2) Trusted user MongoDB থেকে আনা। DB error কখনো 401 নয় — 500।
    let user;
    try {
      // Better Auth user._id সাধারণত ObjectId; তবে string-ও হতে পারে,
      // তাই দুই ফরম্যাটই নিরাপদভাবে খোঁজা হচ্ছে।
      const idCandidates = ObjectId.isValid(subject)
        ? [new ObjectId(subject), subject]
        : [subject];
      user = await userCollection.findOne({ _id: { $in: idCandidates } });
    } catch (error) {
      console.error("verifyToken user lookup failed:", error.message);
      return res.status(500).send({ message: "Internal server error" });
    }

    // 3) Token বৈধ কিন্তু user নেই → 401
    if (!user) {
      return res.status(401).send({ message: "Unauthorized: user not found" });
    }

    // 4) Trusted DB user থেকেই req.user সেট (payload.role ব্যবহার করা হয় না)
    req.user = {
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return next();
  };
}

export { createVerifyToken };
