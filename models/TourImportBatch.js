/**
 * models/TourImportBatch.js
 * Registro de cada importación de participantes desde Excel.
 * Almacena metadatos, errores por fila y estado del batch.
 */
"use strict";

const mongoose = require("mongoose");
const { Schema, Types: { ObjectId } } = mongoose;

const RowErrorSchema = new Schema(
  {
    rowIndex:   { type: Number },
    rowData:    { type: Schema.Types.Mixed },
    rowErrors:  [{ type: String }],
  },
  { _id: false, suppressReservedKeysWarning: true }
);

const TourImportBatchSchema = new Schema(
  {
    tour:     { type: ObjectId, ref: "Tour", required: true, index: true },
    fileName: { type: String },
    status: {
      type: String,
      enum: ["PREVIEW", "CONFIRMED", "CANCELLED"],
      default: "PREVIEW",
    },
    totalRows:     { type: Number, default: 0 },
    validRows:     { type: Number, default: 0 },
    invalidRows:   { type: Number, default: 0 },
    duplicateRows: { type: Number, default: 0 },
    importedCount: { type: Number, default: 0 },
    rowErrors:     [RowErrorSchema],
    createdBy:    { type: ObjectId, ref: "User" },
    confirmedBy:  { type: ObjectId, ref: "User" },
    confirmedAt:  { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TourImportBatch", TourImportBatchSchema);
