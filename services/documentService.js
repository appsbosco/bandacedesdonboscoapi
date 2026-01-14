const Document = require("../models/Document");
const { ApolloError } = require("apollo-server-express");
const { validateMRZ } = require("../utils/mrz");
const {
  isExpired,
  expiresBefore,
  expiresInDays,
  getExpirationSummary,
} = require("../utils/expiration");

class DocumentService {
  /**
   * Valida que el usuario sea el dueño del documento
   */
  static async validateOwnership(documentId, userId) {
    const document = await Document.findOne({
      _id: documentId,
      isDeleted: false,
    });

    if (!document) {
      throw new ApolloError("Documento no encontrado", "NOT_FOUND");
    }

    if (document.owner.toString() !== userId.toString()) {
      throw new ApolloError(
        "No tienes permiso para acceder a este documento",
        "FORBIDDEN"
      );
    }

    return document;
  }

  /**
   * Crea un nuevo documento
   */
  static async createDocument(input, userId) {
    try {
      const document = new Document({
        owner: userId,
        type: input.type,
        source: input.source || "MANUAL",
        status: "UPLOADED",
        notes: input.notes,
        retentionUntil: input.retentionUntil,
        createdBy: userId,
      });

      await document.save();

      // El hook post-findOne no se ejecuta en save, descifrar manualmente
      document.decryptSensitiveFields();

      return document;
    } catch (error) {
      console.error("Error en createDocument:", error);
      throw new ApolloError("Error creando documento", "CREATE_ERROR");
    }
  }

  /**
   * Agrega una imagen a un documento existente
   */
  static async addDocumentImage(input, userId) {
    const document = await this.validateOwnership(input.documentId, userId);

    const newImage = {
      url: input.url,
      provider: input.provider || "CLOUDINARY",
      publicId: input.publicId,
      uploadedAt: new Date(),
    };

    document.images.push(newImage);
    document.updatedBy = userId;

    // Actualizar status si es el primer upload
    if (document.status === "UPLOADED" && document.images.length === 1) {
      document.status = "DATA_CAPTURED";
    }

    await document.save();
    document.decryptSensitiveFields();

    return document;
  }

  /**
   * Actualiza/crea datos extraídos del documento
   */
  static async upsertDocumentExtractedData(input, userId) {
    const document = await this.validateOwnership(input.documentId, userId);

    // Si viene MRZ, validarlo
    let mrzValid = null;
    if (input.mrzRaw) {
      const mrzResult = validateMRZ(input.mrzRaw);
      mrzValid = mrzResult.valid;

      // Si el MRZ es válido y no vinieron otros datos, usar los del MRZ
      if (mrzResult.valid) {
        input.passportNumber = input.passportNumber || mrzResult.passportNumber;
        input.surname = input.surname || mrzResult.surname;
        input.givenNames = input.givenNames || mrzResult.givenNames;
        input.nationality = input.nationality || mrzResult.nationality;
        input.issuingCountry = input.issuingCountry || mrzResult.issuingCountry;
        input.dateOfBirth = input.dateOfBirth || mrzResult.dateOfBirth;
        input.sex = input.sex || mrzResult.sex;
        input.expirationDate = input.expirationDate || mrzResult.expirationDate;
      }
    }

    // Construir fullName si no viene
    const fullName =
      input.fullName ||
      (input.givenNames && input.surname
        ? `${input.givenNames} ${input.surname}`.trim()
        : null);

    // Actualizar extracted data
    document.extracted = {
      fullName,
      givenNames: input.givenNames,
      surname: input.surname,
      nationality: input.nationality,
      issuingCountry: input.issuingCountry,
      documentNumber: input.documentNumber,
      passportNumber: input.passportNumber,
      visaType: input.visaType,
      dateOfBirth: input.dateOfBirth,
      sex: input.sex,
      expirationDate: input.expirationDate,
      issueDate: input.issueDate,
      mrzRaw: input.mrzRaw,
      mrzValid,
      ocrText: input.ocrText,
      ocrConfidence: input.ocrConfidence,
    };

    document.updatedBy = userId;

    // Actualizar status
    if (document.status === "UPLOADED" || document.status === "DATA_CAPTURED") {
      document.status = "DATA_CAPTURED";
    }

    await document.save();
    document.decryptSensitiveFields();

    return document;
  }

  /**
   * Actualiza el status de un documento
   */
  static async setDocumentStatus(documentId, status, userId) {
    const document = await this.validateOwnership(documentId, userId);

    document.status = status;
    document.updatedBy = userId;

    await document.save();
    document.decryptSensitiveFields();

    return document;
  }

  /**
   * Elimina un documento (soft delete)
   */
  static async deleteDocument(documentId, userId) {
    const document = await this.validateOwnership(documentId, userId);

    document.isDeleted = true;
    document.deletedAt = new Date();
    document.updatedBy = userId;

    await document.save();

    return {
      success: true,
      message: "Documento eliminado exitosamente",
    };
  }

  /**
   * Obtiene documentos del usuario con filtros
   */
  static async getMyDocuments(filters = {}, pagination = {}, userId) {
    const { limit = 20, skip = 0 } = pagination;

    // Query base
    const query = {
      owner: userId,
      isDeleted: false,
    };

    // Aplicar filtros
    if (filters.type) {
      query.type = filters.type;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.source) {
      query.source = filters.source;
    }

    // Filtros de expiración
    const now = new Date();

    if (filters.expired === true) {
      query["extracted.expirationDate"] = { $lt: now };
    } else if (filters.expired === false) {
      query["extracted.expirationDate"] = { $gte: now };
    }

    if (filters.expiresBefore) {
      query["extracted.expirationDate"] = {
        ...query["extracted.expirationDate"],
        $lt: new Date(filters.expiresBefore),
      };
    }

    if (filters.expiresInDays) {
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + filters.expiresInDays);

      query["extracted.expirationDate"] = {
        $gte: now,
        $lte: futureDate,
      };
    }

    // Ejecutar query con paginación
    const documents = await Document.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean(); // Usar lean() y descifrar manualmente

    // Descifrar campos sensibles
    const decryptedDocs = documents.map((doc) => {
      const docInstance = new Document(doc);
      docInstance.decryptSensitiveFields();
      return docInstance.toObject();
    });

    const total = await Document.countDocuments(query);

    // Actualizar lastAccessedAt en background (sin await)
    Document.updateMany(
      { _id: { $in: documents.map((d) => d._id) } },
      { $set: { lastAccessedAt: new Date() } }
    ).catch((err) => console.error("Error updating lastAccessedAt:", err));

    return {
      documents: decryptedDocs,
      pagination: {
        total,
        limit,
        skip,
        hasMore: skip + documents.length < total,
      },
    };
  }

  /**
   * Obtiene un documento por ID
   */
  static async getDocumentById(documentId, userId) {
    const document = await this.validateOwnership(documentId, userId);

    // Actualizar lastAccessedAt
    document
      .updateLastAccessed()
      .catch((err) => console.error("Error updating lastAccessedAt:", err));

    document.decryptSensitiveFields();
    return document;
  }

  /**
   * Obtiene resumen de expiración de documentos
   */
  static async getDocumentsExpiringSummary(referenceDate, userId) {
    const refDate = referenceDate ? new Date(referenceDate) : new Date();

    const documents = await Document.find({
      owner: userId,
      isDeleted: false,
      "extracted.expirationDate": { $exists: true },
    }).lean();

    return getExpirationSummary(documents, refDate);
  }
}

module.exports = DocumentService;
