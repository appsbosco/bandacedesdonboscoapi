// src/graphql/shared/raffle.js
const { Ticket } = require("../../../models/Tickets");
const { EventTicket } = require("../../../models/EventTicket");

async function generateRaffleNumbers(eventId, ticketQuantity) {
  const event = await EventTicket.findById(eventId);
  const assignedNumbers = await Ticket.find({ eventId }).distinct(
    "raffleNumbers",
  );

  const allNumbers = Array.from({ length: event.ticketLimit }, (_, i) =>
    (i + 1).toString().padStart(3, "0"),
  );

  const availableNumbers = allNumbers.filter(
    (num) => !assignedNumbers.includes(num),
  );

  if (availableNumbers.length < ticketQuantity) {
    throw new Error(
      "No hay suficientes números de rifa disponibles para este evento.",
    );
  }

  const raffleNumbers = [];
  for (let i = 0; i < ticketQuantity; i++) {
    const randomIndex = Math.floor(Math.random() * availableNumbers.length);
    raffleNumbers.push(availableNumbers.splice(randomIndex, 1)[0]);
  }

  return raffleNumbers;
}

module.exports = { generateRaffleNumbers };
