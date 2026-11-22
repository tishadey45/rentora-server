/**
 * Role-guard middleware।
 *
 * এগুলো শুধু Step 4-এর `verifyToken` সেট করা trusted `req.user.role` পড়ে।
 * request body / query / custom header থেকে role কখনো পড়া হয় না, এবং
 * এখানে JWT verify করা হয় না (সেটি `verifyToken`-এর কাজ)।
 */

function createRoleMiddleware(role) {
  return function verifyRole(req, res, next) {
    // verifyToken আগে চলে না থাকলে req.user থাকবে না → 401
    if (!req.user) {
      return res
        .status(401)
        .send({ message: "Unauthorized: missing authenticated user" });
    }

    // শুধুমাত্র trusted req.user.role ব্যবহার
    if (req.user.role !== role) {
      return res
        .status(403)
        .send({ message: "Forbidden: insufficient role" });
    }

    return next();
  };
}

// Better Auth-এর তিনটি exact role
const verifyRenter = createRoleMiddleware("customer");
const verifyOwner = createRoleMiddleware("owner");
const verifyAdmin = createRoleMiddleware("admin");

export { verifyRenter, verifyOwner, verifyAdmin };
