"use strict";

const service = require("../services/birthday.service");

function getUser(ctx) {
  return ctx?.user || ctx?.me || ctx?.currentUser;
}

module.exports = {
  birthdaysForCalendar: async (_, { year }, ctx) => {
    try {
      const currentUser = getUser(ctx);
      if (!currentUser) throw new Error("No autenticado");
      return await service.getVisibleCalendarEventsForUser(currentUser, { year });
    } catch (error) {
      console.error("[query:birthdaysForCalendar]", error.message);
      throw new Error(error.message || "No se pudieron obtener los cumpleaños");
    }
  },

  todaysBirthdays: async (_, __, ctx) => {
    try {
      const currentUser = getUser(ctx);
      if (!currentUser) throw new Error("No autenticado");
      return await service.getTodaysBirthdaysForUser(currentUser);
    } catch (error) {
      console.error("[query:todaysBirthdays]", error.message);
      throw new Error(error.message || "No se pudieron obtener los cumpleaños de hoy");
    }
  },

  upcomingBirthdays: async (_, { days }, ctx) => {
    try {
      const currentUser = getUser(ctx);
      if (!currentUser) throw new Error("No autenticado");
      return await service.getUpcomingBirthdaysForUser(currentUser, { days });
    } catch (error) {
      console.error("[query:upcomingBirthdays]", error.message);
      throw new Error(error.message || "No se pudieron obtener los próximos cumpleaños");
    }
  },
};
