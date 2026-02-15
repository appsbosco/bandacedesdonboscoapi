const Guatemala = require("../../../../../models/Guatemala");

module.exports = {
  Guatemala: {
    children: async (doc) => {
      // Si ya viene populado, devolverlo tal cual
      if (Array.isArray(doc.children) && doc.children.length > 0) {
        const first = doc.children[0];
        if (first && typeof first === "object" && first._id)
          return doc.children;
      }

      // Si no viene populado, populamos bajo demanda
      const populated = await Guatemala.findById(doc._id).populate("children");
      return populated?.children || [];
    },
  },
};
