const { computeStatus } = require("../services/inventory.service");

module.exports = {
  Inventory: {
    status: (parent) => computeStatus(parent),
  },
};
