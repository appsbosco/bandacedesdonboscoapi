const admin = require("./config/firebase");
const mongoose = require("mongoose");
const User = require("./models/User");

mongoose.connect(
  "mongodb+srv://admin:bWKcNWCAs5rka9oC@cluster0.ibzf4il.mongodb.net/APP-BCDB",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

async function identifyInvalidTokens() {
  try {
    // Obtener todos los usuarios con tokens de notificación
    const users = await User.find({
      notificationTokens: { $exists: true, $ne: [] },
    });

    let tokens = users.flatMap((user) => user.notificationTokens);
    console.log("Total de tokens encontrados:", tokens.length);

    if (tokens.length === 0) {
      console.log("No hay tokens registrados.");
      return;
    }

    // 🔹 **Validar tokens**
    const invalidTokensSet = new Set(); // Usamos Set para evitar duplicados
    await Promise.all(
      tokens.map(async (token) => {
        try {
          await admin.messaging().send({
            token,
            notification: {
              title: "Otra prueba, perdón 🫤",
              body: "Otra prueba, perdón 🫤",
            },
          });
        } catch (error) {
          if (error.code === "messaging/registration-token-not-registered") {
            invalidTokensSet.add(token); // Guardar tokens inválidos
          }
        }
      })
    );

    const invalidTokens = Array.from(invalidTokensSet);

    if (invalidTokens.length > 0) {
      console.log("Tokens inválidos detectados:", invalidTokens);

      // Encontrar los usuarios con tokens inválidos y filtrar los tokens inválidos de cada usuario
      const usersWithInvalidTokens = await User.find({
        notificationTokens: { $in: invalidTokens },
      });

      console.log("\n🔹 Usuarios con tokens inválidos:");
      usersWithInvalidTokens.forEach((user) => {
        const userInvalidTokens = user.notificationTokens.filter((token) =>
          invalidTokens.includes(token)
        );

        console.log(
          `👤 Usuario: ${user.name} ${user.firstSurName} (${user.email})`
        );
        console.log(`🚫 Tokens inválidos: ${userInvalidTokens.join(", ")}`);
        console.log("----------------------------");
      });
    } else {
      console.log("✅ No hay tokens inválidos.");
    }
  } catch (error) {
    console.error("❌ Error al verificar tokens inválidos:", error);
  } finally {
    mongoose.connection.close();
  }
}

// Ejecutar la función
identifyInvalidTokens();

// async function identifyInvalidTokens() {
//   try {
//     // Obtener todos los usuarios con tokens de notificación
//     const users = await User.find({
//       notificationTokens: { $exists: true, $ne: [] },
//     });

//     let tokens = users.flatMap((user) => user.notificationTokens);
//     console.log("Total de tokens encontrados:", tokens.length);

//     if (tokens.length === 0) {
//       console.log("No hay tokens registrados.");
//       return;
//     }

//     // 🔹 **Simulación sin enviar**
//     // Se consulta Firebase para ver cuáles tokens aún son válidos
//     const invalidTokens = await Promise.all(
//       tokens.map(async (token) => {
//         try {
//           await admin.messaging().send({
//             token,
//             notification: {
//               title: "Otra prueba, perdón 🫤",
//               body: "Otra prueba, perdón 🫤 ",
//             },
//           });
//           return null; // Token válido
//         } catch (error) {
//           if (error.code === "messaging/registration-token-not-registered") {
//             return token; // Token inválido
//           }
//           return null;
//         }
//       })
//     );

//     // Filtrar los tokens inválidos
//     const filteredInvalidTokens = invalidTokens.filter(
//       (token) => token !== null
//     );

//     if (filteredInvalidTokens.length > 0) {
//       console.log("Tokens inválidos detectados:", filteredInvalidTokens);

//       // Encontrar los usuarios con esos tokens inválidos
//       const usersWithInvalidTokens = await User.find({
//         notificationTokens: { $in: filteredInvalidTokens },
//       });

//       console.log("Usuarios con tokens inválidos:");
//       usersWithInvalidTokens.forEach((user) => {
//         console.log(
//           `Usuario: ${
//             (user.name + " " + user.firstSurName + " ", user.email)
//           } - Tokens: ${user.notificationTokens}`
//         );
//       });
//     } else {
//       console.log("No hay tokens inválidos.");
//     }
//   } catch (error) {
//     console.error("Error al verificar tokens inválidos:", error);
//   } finally {
//     mongoose.connection.close();
//   }
// }

// // Ejecutar la función
// identifyInvalidTokens();
