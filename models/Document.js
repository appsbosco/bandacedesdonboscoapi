const mongoose = require("mongoose");
const { encryptField, decryptField } = require("../utils/encryption");

const documentImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      enum: ["CLOUDINARY", "S3"],
      default: "CLOUDINARY",
    },
    publicId: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const extractedDataSchema = new mongoose.Schema(
  {
    fullName: String,
    givenNames: String,
    surname: String,
    nationality: String,
    issuingCountry: String,
    // Campos cifrados - se almacenan como strings encriptados
    documentNumber: String,
    passportNumber: String,
    // Fin campos cifrados
    visaType: String,
    dateOfBirth: Date,
    sex: {
      type: String,
      enum: ["M", "F", "X", null],
    },
    expirationDate: Date,
    issueDate: Date,
    // MRZ fields
    mrzRaw: String, // También cifrado
    mrzValid: Boolean,
    // OCR fields
    ocrText: String,
    ocrConfidence: Number,
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["PASSPORT", "VISA"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "UPLOADED",
        "DATA_CAPTURED",
        "OCR_PENDING",
        "OCR_SUCCESS",
        "OCR_FAILED",
        "VERIFIED",
        "REJECTED",
      ],
      default: "UPLOADED",
    },
    source: {
      type: String,
      enum: ["MANUAL", "OCR"],
      default: "MANUAL",
    },
    images: [documentImageSchema],
    extracted: extractedDataSchema,
    notes: String,
    retentionUntil: Date,
    lastAccessedAt: Date,
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Índices compuestos para optimización
documentSchema.index({ owner: 1, type: 1, "extracted.expirationDate": 1 });
documentSchema.index({ owner: 1, isDeleted: 1 });
documentSchema.index({ "extracted.expirationDate": 1, isDeleted: 1 });

// Virtual para verificar expiración
documentSchema.virtual("isExpired").get(function () {
  if (!this.extracted?.expirationDate) return null;
  return new Date(this.extracted.expirationDate) < new Date();
});

// Método para cifrar campos sensibles antes de guardar
documentSchema.methods.encryptSensitiveFields = function () {
  if (this.extracted) {
    if (this.extracted.documentNumber) {
      this.extracted.documentNumber = encryptField(
        this.extracted.documentNumber
      );
    }
    if (this.extracted.passportNumber) {
      this.extracted.passportNumber = encryptField(
        this.extracted.passportNumber
      );
    }
    if (this.extracted.mrzRaw) {
      this.extracted.mrzRaw = encryptField(this.extracted.mrzRaw);
    }
  }
};

// Método para descifrar campos sensibles después de leer
documentSchema.methods.decryptSensitiveFields = function () {
  if (this.extracted) {
    if (this.extracted.documentNumber) {
      try {
        this.extracted.documentNumber = decryptField(
          this.extracted.documentNumber
        );
      } catch (err) {
        // Si falla el descifrado, mantener el valor original
        console.error("Error decrypting documentNumber:", err.message);
      }
    }
    if (this.extracted.passportNumber) {
      try {
        this.extracted.passportNumber = decryptField(
          this.extracted.passportNumber
        );
      } catch (err) {
        console.error("Error decrypting passportNumber:", err.message);
      }
    }
    if (this.extracted.mrzRaw) {
      try {
        this.extracted.mrzRaw = decryptField(this.extracted.mrzRaw);
      } catch (err) {
        console.error("Error decrypting mrzRaw:", err.message);
      }
    }
  }
  return this;
};

// Hook pre-save para cifrar automáticamente
documentSchema.pre("save", function (next) {
  if (this.isModified("extracted")) {
    this.encryptSensitiveFields();
  }
  next();
});

// Hook post-find para descifrar automáticamente
documentSchema.post("find", function (docs) {
  if (docs && docs.length) {
    docs.forEach((doc) => {
      if (doc.decryptSensitiveFields) {
        doc.decryptSensitiveFields();
      }
    });
  }
});

documentSchema.post("findOne", function (doc) {
  if (doc && doc.decryptSensitiveFields) {
    doc.decryptSensitiveFields();
  }
});

// Método para actualizar lastAccessedAt
documentSchema.methods.updateLastAccessed = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

const Document = mongoose.model("Document", documentSchema);

module.exports = Document;
