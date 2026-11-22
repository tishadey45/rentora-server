import cors from "cors";
import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import { verifyOwner } from "./middleware/verifyRole.js";
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
console.log(uri);

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
  "/api/v1/bookings/my-rentals",
  verifyToken,
  verifyOwner,
  async (req, res) => {
    try {
      const email = req.user.email;

      const result = await bookingsCollection
        .find({ "owner.email": email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send({
        success: true,
        message: "My rentals fetched successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error fetching my rentals:", error.message);

      res.status(500).send({
        success: false,
        message: "Failed to fetch my rentals",
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
