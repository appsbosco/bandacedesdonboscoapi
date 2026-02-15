const Guatemala = require("../../../../../models/Guatemala");

async function addGuatemala(input) {
  try {
    if (!input || typeof input !== "object") {
      throw new Error("Invalid input");
    }

    const newGuatemala = new Guatemala(input);
    return await newGuatemala.save();
  } catch (error) {
    console.error("travelForms.service.addGuatemala:", error);
    throw new Error("Failed to add guatemala.");
  }
}

async function getGuatemala() {
  try {
    return await Guatemala.find().populate("children");
  } catch (error) {
    console.error("travelForms.service.getGuatemala:", error);
    throw new Error("Failed to fetch guatemala.");
  }
}

module.exports = {
  addGuatemala,
  getGuatemala,
};
