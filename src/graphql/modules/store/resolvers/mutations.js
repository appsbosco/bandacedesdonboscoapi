const storeService = require("../services/store.service");

module.exports = {
  createProduct: async (
    _,
    {
      name,
      description,
      category,
      price,
      availableForDays,
      photo,
      closingDate,
    },
    ctx,
  ) => {
    try {
      return await storeService.createProduct(
        {
          name,
          description,
          category,
          price,
          availableForDays,
          photo,
          closingDate,
        },
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        error.message || "Hubo un problema al crear el producto.",
      );
    }
  },

  updateProduct: async (
    _,
    {
      id,
      name,
      description,
      category,
      price,
      availableForDays,
      closingDate,
      photo,
    },
    ctx,
  ) => {
    try {
      return await storeService.updateProduct(
        {
          id,
          name,
          description,
          category,
          price,
          availableForDays,
          closingDate,
          photo,
        },
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo actualizar el producto");
    }
  },

  deleteProduct: async (_, { id }, ctx) => {
    try {
      return await storeService.deleteProduct(id, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo eliminar el producto");
    }
  },

  createOrder: async (_, { userId, products, fulfillmentDate }, ctx) => {
    try {
      return await storeService.createOrder(
        userId,
        products,
        ctx,
        fulfillmentDate,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo crear la orden");
    }
  },

  completeOrder: async (_, { orderId }, ctx) => {
    try {
      return await storeService.completeOrder(orderId, ctx);
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo completar la orden");
    }
  },

  recordPickup: async (
    _,
    { orderId, itemId, quantityPickedUp, pickedUpAt },
    ctx,
  ) => {
    try {
      return await storeService.recordPickup(
        orderId,
        itemId,
        quantityPickedUp,
        pickedUpAt,
        ctx,
      );
    } catch (error) {
      console.error(error);
      throw new Error(error.message || "No se pudo registrar el retiro");
    }
  },
};
