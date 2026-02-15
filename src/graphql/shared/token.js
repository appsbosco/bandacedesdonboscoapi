const jwt = require("jsonwebtoken");

const createToken = (user, secret, expiresIn) => {
  const {
    id,
    name,
    firstSurName,
    secondSurName,
    email,
    birthday,
    carnet,
    state,
    grade,
    phone,
    role,
    instrument,
  } = user;

  return jwt.sign(
    {
      id,
      email,
      name,
      firstSurName,
      secondSurName,
      birthday,
      carnet,
      state,
      grade,
      phone,
      role,
      instrument,
    },
    secret,
    { expiresIn },
  );
};

module.exports = { createToken };
