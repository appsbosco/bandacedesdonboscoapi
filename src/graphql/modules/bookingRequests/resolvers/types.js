const { normalizeBookingRequestEventType } = require("../services/bookingRequests.service");

const toStr = (value) => (value == null ? null : String(value));
const toId = (value) => String(value?._id || value?.id || "");
const toRequiredStr = (value, fallback = "") => (value == null ? fallback : String(value));
const toRequiredBool = (value, fallback = false) => (value == null ? fallback : Boolean(value));

module.exports = {
  BookingRequest: {
    id: toId,
    ensemble: (request) => toRequiredStr(request.ensemble),
    fullName: (request) => toRequiredStr(request.fullName, "Solicitud sin nombre"),
    email: (request) => toRequiredStr(request.email),
    phone: (request) => toRequiredStr(request.phone),
    eventType: (request) => normalizeBookingRequestEventType(request.eventType),
    eventTypeOther: (request) => toStr(request.eventTypeOther),
    eventDate: (request) => toRequiredStr(request.eventDate),
    eventTime: (request) => toRequiredStr(request.eventTime),
    venue: (request) => toRequiredStr(request.venue, "No indicado"),
    province: (request) => toRequiredStr(request.province, "No indicado"),
    canton: (request) => toRequiredStr(request.canton, "No indicado"),
    district: (request) => toRequiredStr(request.district, "No indicado"),
    address: (request) => toRequiredStr(request.address, "No indicado"),
    estimatedDuration: (request) => toRequiredStr(request.estimatedDuration, "No indicado"),
    message: (request) => toRequiredStr(request.message),
    acceptedDataPolicy: (request) => toRequiredBool(request.acceptedDataPolicy, false),
    status: (request) => toRequiredStr(request.status, "NEW"),
    company: (request) => toStr(request.company),
    statusNotes: (request) => toStr(request.statusNotes),
    notificationEmailSentAt: (request) => toStr(request.notificationEmailSentAt),
    confirmationEmailSentAt: (request) => toStr(request.confirmationEmailSentAt),
    createdAt: (request) => toRequiredStr(request.createdAt),
    updatedAt: (request) => toRequiredStr(request.updatedAt),
  },
};
