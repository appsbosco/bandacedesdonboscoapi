const admin = require("./config/firebase");
const mongoose = require("mongoose");
const User = require("./models/User"); // Asegúrate de que la ruta sea correcta

// Conexión a la base de datos MongoDB (ajusta la URL de tu DB)
mongoose.connect(
  "mongodb+srv://admin:bWKcNWCAs5rka9oC@cluster0.ibzf4il.mongodb.net/APP-BCDB",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
);

async function sendTestNotification() {
  try {
    const users = await User.find({
      notificationTokens: { $exists: true, $ne: [] },
    });

    const tokens = users.flatMap((user) => user.notificationTokens);

    if (tokens.length === 0) {
      console.log("No hay tokens registrados para recibir notificaciones.");
      return;
    }

    const message = {
      notification: {
        title: "Nuevo Producto Disponible",
        body: "Un nuevo producto ha sido añadido y ya puedes hacer la solicitud de tu almuerzo.",
      },
      tokens: tokens,
    };

    // 🔹 Se usa `sendEachForMulticast()` en lugar de `sendMulticast()`
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(
      `${response.successCount} mensajes fueron enviados exitosamente.`,
    );

    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          console.log(`Error en el token en índice ${idx}:`, resp.error);
        }
      });
    }
  } catch (error) {
    console.error("Error al enviar la notificación:", error);
  } finally {
    mongoose.connection.close();
  }
}

sendTestNotification();
