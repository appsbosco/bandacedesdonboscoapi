// scripts/migrateOrders.js
require("dotenv").config();
const mongoose = require("mongoose");
const dbConnection = require("../config/database");

async function migrate() {
  await dbConnection();
  const db = mongoose.connection.db;
  const collection = db.collection("orders");

  const cursor = collection.find({});
  let count = 0;

  for await (const order of cursor) {
    const updatedProducts = (order.products || []).map((p) => ({
      ...p,
      // Compatibilidad: si ya tenía quantityPickedUp, respetarlo
      quantityPickedUp: p.quantityPickedUp ?? 0,
      status: p.status ?? (order.isCompleted ? "completed" : "pending"),
      pickedUpAt: p.pickedUpAt ?? (order.isCompleted ? order.orderDate : null),
    }));

    await collection.updateOne(
      { _id: order._id },
      {
        $set: {
          products: updatedProducts,
          // fulfillmentDate: no lo inferimos, queda null → los reportes harán fallback a orderDate
        },
      },
    );
    count++;
  }

  console.log(`Migradas ${count} órdenes.`);
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
