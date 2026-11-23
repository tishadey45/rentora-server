import cors from "cors";
import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import { verifyAdmin, verifyOwner, verifyRenter } from "./middleware/verifyRole.js";
import { createVerifyToken } from "./middleware/verifyToken.js";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://rentora-six-iota.vercel.app"],
    credentials: true,
  }),
);
app.use(express.json());

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is missing!");
}
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
let clientPromise;

async function connectToMongoDB() {
  try {
    if (!clientPromise) {
      console.log("Connecting to MongoDB...");

      clientPromise = client.connect().catch((error) => {
        clientPromise = null;
        throw error;
      });
    }
    await clientPromise;

    console.log("MongoDB connected successfully!");

    return client;
  } catch (error) {
    console.error("MongoDB Connection Failed!");
    console.error(error.message);
    throw error;
  }
}

const db = client.db("rentora");
const equipmentCollection = db.collection("equipmentCollection");
const userCollection = db.collection("user");
const bookingsCollection = db.collection("bookingsCollection");

const verifyToken = createVerifyToken(userCollection);

app.use(async (req, res, next) => {
  try {
    await connectToMongoDB();
    next();
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "MongoDB connection failed",
      error: error.message,
    });
  }
});

const isValidObjectId = (id) =>
  ObjectId.isValid(id) && String(new ObjectId(id)) === id;

app.post("/api/v1/equipment", verifyToken, verifyOwner, async (req, res) => {
  try {
    const data = req.body;
    console.log(data);
    const result = await equipmentCollection.insertOne(data);
    res.send(result);
  } catch (error) {
    console.error("Error inserting equipment:", error.message);
    res.status(500).send({
      message: "Failed to insert equipment",
    });
  }
});

app.get("/api/v1/equipment", async (req, res) => {
  try {
    const result = await equipmentCollection.find({}).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching equipment:", error.message);
    res.status(500).send({ message: "Failed to fetch equipment" });
  }
});

app.get(
  "/api/v1/equipment/my-equipment",
  verifyToken,
  verifyOwner,
  async (req, res) => {
    try {
      const email = req.user.email;

      const result = await equipmentCollection
        .find({ "owner.email": email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send({
        success: true,
        message: "My equipment fetched successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error fetching my equipment:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to fetch my equipment",
      });
    }
  },
);

// Owners only. Returns the signed-in owner's own bookings for their equipment.
// app.get(
//   "/api/v1/bookings/my-rentals",
//   verifyToken,
//   verifyOwner,
//   async (req, res) => {
//     try {
//       const email = req.user.email;

//       const result = await bookingsCollection
//         .find({ "owner.email": email })
//         .sort({ createdAt: -1 })
//         .toArray();

//       res.send({
//         success: true,
//         message: "My rentals fetched successfully",
//         data: result,
//       });
//     } catch (error) {
//       console.error("Error fetching my rentals:", error.message);

//       res.status(500).send({
//         success: false,
//         message: "Failed to fetch my rentals",
//       });
//     }
//   },
// );

// Customers only. Returns the signed-in customer's own bookings.
app.get(
  "/api/v1/bookings/my-bookings",
  verifyToken,
  verifyRenter,
  async (req, res) => {
    try {
      // The customer is identified only from the verified token.
      const email = req.user.email;

      const result = await bookingsCollection
        .aggregate([
          { $match: { "customer.email": email } },
          {
            $lookup: {
              from: "equipmentCollection",
              localField: "equipmentId",
              foreignField: "_id",
              as: "equipmentDoc",
            },
          },
          {
            $addFields: {
              equipmentDoc: { $arrayElemAt: ["$equipmentDoc", 0] },
            },
          },
          { $sort: { createdAt: -1 } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              equipmentId: {
                $convert: {
                  input: "$equipmentId",
                  to: "string",
                  onError: null,
                  onNull: null,
                },
              },
              equipmentName: "$equipmentDoc.name",
              equipmentImage: "$equipmentDoc.image",
              startDate: 1,
              endDate: 1,
              bookingDate: 1,
              totalAmount: 1,
              paymentStatus: 1,
              bookingStatus: 1,
              createdAt: 1,
            },
          },
        ])
        .toArray();

      res.send({
        success: true,
        message: "My bookings fetched successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error fetching my bookings:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to fetch my bookings",
      });
    }
  },
);

const BOOKING_DAY_MS = 24 * 60 * 60 * 1000;

// Parses a strict "YYYY-MM-DD" string into a UTC date (midnight), or null.
function parseDateOnly(value) {
  if (typeof value !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Reject values that roll over (e.g. 2026-02-31).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

// Inclusive duration in days → billable units based on the rental type.
function calculateUnitCount(rentalType, durationDays) {
  if (rentalType === "Weekly") return Math.ceil(durationDays / 7);
  if (rentalType === "Monthly") return Math.ceil(durationDays / 30);
  return durationDays;
}

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

// Customers only. Creates a booking for the signed-in customer.
app.post(
  "/api/v1/bookings",
  verifyToken,
  verifyRenter,
  async (req, res) => {
    try {
      const body = req.body ?? {};
      const {
        equipmentId,
        startDate,
        endDate,
        quantity,
        contactNumber,
        deliveryAddress,
        notes,
      } = body;

      // ---- equipment id ----
      if (!isValidObjectId(equipmentId)) {
        return res.status(400).send({
          success: false,
          message: "Invalid equipment ID",
        });
      }

      // ---- dates ----
      const start = parseDateOnly(startDate);
      const end = parseDateOnly(endDate);

      if (!start || !end) {
        return res.status(400).send({
          success: false,
          message: "Invalid start or end date. Use YYYY-MM-DD.",
        });
      }

      if (end < start) {
        return res.status(400).send({
          success: false,
          message: "End date must be on or after the start date",
        });
      }

      if (start < startOfTodayUtc()) {
        return res.status(400).send({
          success: false,
          message: "Start date cannot be in the past",
        });
      }

      // ---- quantity ----
      const quantityNumber =
        typeof quantity === "number"
          ? quantity
          : typeof quantity === "string" && quantity.trim() !== ""
            ? Number(quantity)
            : NaN;

      if (!Number.isInteger(quantityNumber) || quantityNumber < 1) {
        return res.status(400).send({
          success: false,
          message: "Quantity must be a whole number of at least 1",
        });
      }

      // ---- contact + address ----
      if (typeof contactNumber !== "string" || !contactNumber.trim()) {
        return res.status(400).send({
          success: false,
          message: "Contact number is required",
        });
      }

      if (
        typeof deliveryAddress !== "string" ||
        !deliveryAddress.trim()
      ) {
        return res.status(400).send({
          success: false,
          message: "Delivery address is required",
        });
      }

      // ---- equipment (authoritative source of price/owner) ----
      const equipment = await equipmentCollection.findOne({
        _id: new ObjectId(equipmentId),
      });

      if (!equipment) {
        return res.status(404).send({
          success: false,
          message: "Equipment not found",
        });
      }

      if (equipment.isApproved !== true) {
        return res.status(409).send({
          success: false,
          message: "This equipment is not available for booking",
        });
      }

      if (equipment.availability === "unavailable") {
        return res.status(409).send({
          success: false,
          message: "This equipment is currently unavailable",
        });
      }

      const availableQuantity = Number(equipment.availableQuantity);
      if (
        Number.isFinite(availableQuantity) &&
        quantityNumber > availableQuantity
      ) {
        return res.status(409).send({
          success: false,
          message: "Not enough units available for the requested quantity",
        });
      }

      const rentalPrice = Number(equipment.rentalPrice);
      if (!Number.isFinite(rentalPrice) || rentalPrice < 0) {
        return res.status(500).send({
          success: false,
          message: "Equipment price is invalid",
        });
      }

      // ---- calculate amount from the DB price only ----
      const durationDays = Math.floor((end - start) / BOOKING_DAY_MS) + 1;
      const unitCount = calculateUnitCount(equipment.rentalType, durationDays);
      const totalAmount = roundToTwo(
        rentalPrice * unitCount * quantityNumber
      );

      const now = new Date();
      const owner = equipment.owner ?? {};

      const bookingDoc = {
        customer: {
          id: req.user.id,
          name: req.user.name,
          email: req.user.email,
        },
        equipmentId: equipment._id,
        equipment: {
          name: equipment.name,
          image: equipment.image,
          category: equipment.category,
          rentalPrice,
          rentalType: equipment.rentalType,
        },
        owner: {
          id: owner.id ?? "",
          name: owner.name ?? "",
          email: owner.email ?? "",
        },
        startDate: formatDateOnly(start),
        endDate: formatDateOnly(end),
        durationDays,
        quantity: quantityNumber,
        unitCount,
        totalAmount,
        paymentStatus: "pending",
        bookingStatus: "upcoming",
        contactNumber: contactNumber.trim(),
        deliveryAddress: deliveryAddress.trim(),
        notes: typeof notes === "string" ? notes.trim() : "",
        bookingDate: now,
        createdAt: now,
        updatedAt: now,
      };

      const result = await bookingsCollection.insertOne(bookingDoc);

      res.status(201).send({
        success: true,
        message: "Booking created successfully",
        data: { ...bookingDoc, _id: result.insertedId },
      });
    } catch (error) {
      console.error("Error creating booking:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to create booking",
      });
    }
  },
);

app.get("/api/v1/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({ message: "Invalid equipment ID" });
    }

    const result = await equipmentCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({ message: "Equipment not found" });
    }

    res.send(result);
  } catch (error) {
    console.error("Get Single equipment Error:", error);
    res.status(500).send({ message: "Failed to get equipment" });
  }
});

app.delete("/api/v1/equipment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(id);
    if (!isValidObjectId(id)) {
      return res.status(400).send({ message: "Invalid equipment ID" });
    }

    const result = await equipmentCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    console.error("Delete equipment Error:", error);
    res.status(500).send({ message: "Failed to delete equipment" });
  }
});

app.patch(
  "/api/v1/equipment/:id",
  verifyToken,
  verifyOwner,
  async (req, res) => {
    try {
      const { id } = req.params;
      console.log(id);

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid equipment ID",
        });
      }

      const email = req.user.email;

      const {
        name,
        category,
        rentalPrice,
        availableQuantity,
        description,
        image,
      } = req.body;

      const updatedData = {};

      if (name !== undefined) updatedData.name = name;

      if (category !== undefined) updatedData.category = category;

      if (rentalPrice !== undefined) updatedData.rentalPrice = rentalPrice;

      if (availableQuantity !== undefined)
        updatedData.availableQuantity = availableQuantity;

      if (description !== undefined) updatedData.description = description;

      if (image !== undefined) updatedData.image = image;

      if (Object.keys(updatedData).length === 0) {
        return res.status(400).send({
          success: false,
          message: "No data provided to update",
        });
      }

      updatedData.updatedAt = new Date();

      const result = await equipmentCollection.updateOne(
        {
          _id: new ObjectId(id),
          "owner.email": email,
        },
        {
          $set: updatedData,
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({
          success: false,
          message: "Equipment not found or you are not the owner",
        });
      }

      res.send({
        success: true,
        message: "Equipment updated successfully",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Error updating equipment:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to update equipment",
      });
    }
  },
);




app.get(
  "/api/v1/admin/users",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const result = await userCollection
        .find(
          {},
          { projection: { name: 1, email: 1, role: 1, status: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .toArray();

      res.send({
        success: true,
        message: "Users fetched successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error fetching users:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to fetch users",
      });
    }
  },
);

// Admins only. Changes only the target user's role.
app.patch(
  "/api/v1/admin/users/:id/role",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { role } = req.body ?? {};
      const allowedRoles = ["customer", "owner", "admin"];

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid user ID",
        });
      }

      if (!allowedRoles.includes(role)) {
        return res.status(400).send({
          success: false,
          message: `Invalid role. Allowed roles: ${allowedRoles.join(", ")}`,
        });
      }

      const targetUser = await userCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!targetUser) {
        return res.status(404).send({
          success: false,
          message: "User not found",
        });
      }

      // An admin cannot change their own role (prevents accidental lockout).
      if (String(targetUser._id) === req.user.id) {
        return res.status(409).send({
          success: false,
          message: "You cannot change your own role",
        });
      }

      // Never demote the last remaining admin.
      if (targetUser.role === "admin" && role !== "admin") {
        const adminCount = await userCollection.countDocuments({
          role: "admin",
        });

        if (adminCount <= 1) {
          return res.status(409).send({
            success: false,
            message: "Cannot demote the last remaining admin",
          });
        }
      }

      const updatedUser = await userCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { role } },
        {
          returnDocument: "after",
          projection: { name: 1, email: 1, role: 1, createdAt: 1 },
        },
      );

      if (!updatedUser) {
        return res.status(404).send({
          success: false,
          message: "User not found",
        });
      }

      res.send({
        success: true,
        message: "User role updated successfully",
        data: {
          _id: String(updatedUser._id),
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          createdAt: updatedUser.createdAt,
        },
      });
    } catch (error) {
      console.error("Error updating user role:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to update user role",
      });
    }
  },
);

// Admins only. Activates or deactivates a user account.
app.patch(
  "/api/v1/admin/users/:id/status",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body ?? {};
      const allowedStatuses = ["active", "inactive"];

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid user ID",
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).send({
          success: false,
          message: `Invalid status. Allowed statuses: ${allowedStatuses.join(", ")}`,
        });
      }

      const targetUser = await userCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!targetUser) {
        return res.status(404).send({
          success: false,
          message: "User not found",
        });
      }

      // An admin cannot deactivate their own account.
      if (String(targetUser._id) === req.user.id && status === "inactive") {
        return res.status(409).send({
          success: false,
          message: "You cannot deactivate your own account",
        });
      }

      const updatedUser = await userCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { status } },
        {
          returnDocument: "after",
          projection: {
            name: 1,
            email: 1,
            role: 1,
            status: 1,
            createdAt: 1,
          },
        },
      );

      if (!updatedUser) {
        return res.status(404).send({
          success: false,
          message: "User not found",
        });
      }

      res.send({
        success: true,
        message: "User status updated successfully",
        data: {
          _id: String(updatedUser._id),
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          // Users created before the status field exist are treated as active.
          status: updatedUser.status ?? "active",
          createdAt: updatedUser.createdAt,
        },
      });
    } catch (error) {
      console.error("Error updating user status:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to update user status",
      });
    }
  },
);

// ---------------------- Admin: All Equipment ----------------------

const EQUIPMENT_STATUSES = ["pending", "approved", "rejected"];

// Fields an admin may update through the general equipment update endpoint.
// Protected fields (_id, id, owner, isApproved, status) are intentionally excluded.
const EQUIPMENT_UPDATE_FIELDS = [
  "name",
  "description",
  "category",
  "rentalPrice",
  "rentalType",
  "location",
  "availableQuantity",
  "availability",
  "image",
  "imageAlt",
  "brand",
  "model",
  "condition",
  "rentalTerms",
];

// Derives a status for equipment documents created before the `status` field.
function resolveEquipmentStatus(equipment) {
  if (EQUIPMENT_STATUSES.includes(equipment.status)) {
    return equipment.status;
  }

  return equipment.isApproved === true ? "approved" : "pending";
}

// Admins only. Returns all equipment (newest first) with a status.
app.get(
  "/api/v1/admin/equipment",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const equipment = await equipmentCollection
        .find({})
        .sort({ _id: -1 })
        .toArray();

      const data = equipment.map((item) => ({
        ...item,
        status: resolveEquipmentStatus(item),
      }));

      res.send({
        success: true,
        message: "Equipment fetched successfully",
        data,
      });
    } catch (error) {
      console.error("Error fetching admin equipment:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to fetch equipment",
      });
    }
  },
);

// Admins only. Approves or rejects an equipment item.
app.patch(
  "/api/v1/admin/equipment/:id/status",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body ?? {};

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid equipment ID",
        });
      }

      if (!EQUIPMENT_STATUSES.includes(status)) {
        return res.status(400).send({
          success: false,
          message: `Invalid status. Allowed statuses: ${EQUIPMENT_STATUSES.join(", ")}`,
        });
      }

      const updatedEquipment = await equipmentCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            status,
            isApproved: status === "approved",
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );

      if (!updatedEquipment) {
        return res.status(404).send({
          success: false,
          message: "Equipment not found",
        });
      }

      res.send({
        success: true,
        message: "Equipment status updated successfully",
        data: {
          ...updatedEquipment,
          status: resolveEquipmentStatus(updatedEquipment),
        },
      });
    } catch (error) {
      console.error("Error updating equipment status:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to update equipment status",
      });
    }
  },
);

// Admins only. Updates safe equipment information fields.
app.patch(
  "/api/v1/admin/equipment/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid equipment ID",
        });
      }

      const body = req.body ?? {};
      const updatedData = {};

      for (const field of EQUIPMENT_UPDATE_FIELDS) {
        if (body[field] !== undefined) {
          updatedData[field] = body[field];
        }
      }

      if (Object.keys(updatedData).length === 0) {
        return res.status(400).send({
          success: false,
          message: "No valid fields provided to update",
        });
      }

      updatedData.updatedAt = new Date();

      const updatedEquipment = await equipmentCollection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updatedData },
        { returnDocument: "after" },
      );

      if (!updatedEquipment) {
        return res.status(404).send({
          success: false,
          message: "Equipment not found",
        });
      }

      res.send({
        success: true,
        message: "Equipment updated successfully",
        data: {
          ...updatedEquipment,
          status: resolveEquipmentStatus(updatedEquipment),
        },
      });
    } catch (error) {
      console.error("Error updating equipment:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to update equipment",
      });
    }
  },
);

// Admins only. Deletes an equipment item.
app.delete(
  "/api/v1/admin/equipment/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid equipment ID",
        });
      }

      const result = await equipmentCollection.deleteOne({
        _id: new ObjectId(id),
      });
      if (result.deletedCount === 0) {
        return res.status(404).send({
          success: false,
          message: "Equipment not found",
        });
      }

      res.send({
        success: true,
        message: "Equipment deleted successfully",
        data: { deletedCount: result.deletedCount },
      });
    } catch (error) {
      console.error("Error deleting equipment:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to delete equipment",
      });
    }
  },
);

app.get("/", (req, res) => {
  res.send("rentora Server is Running!");
});

if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 5000;

  connectToMongoDB()
    .then(() => {
      app.listen(port, () => {
        console.log(`rentora Server running on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Server startup failed:", error.message);
      process.exit(1);
    });
}

export default app;
