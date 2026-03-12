import { gql } from "graphql-tag";

export const typeDefs = gql`
  # ── Tipos de entrada ─────────────────────────────────────

  input CompasInput {
    numerador: Int!
    denominador: Int!
  }

  input TempoInput {
    tipo: String!
    bpm: Float
    inicio: Float
    fin: Float
    curva: String
  }

  input SeccionInput {
    seccionId: String!
    nombre: String!
    compas: CompasInput!
    tempo: TempoInput!
    subdivision: Int
    patronAcento: [Int]
    repeticiones: Int
  }

  input CrearSecuenciaInput {
    nombre: String!
    descripcion: String
    secciones: [SeccionInput!]!
    countIn: Boolean
    countInBeats: Int
    sonido: String
    volumen: Float
  }

  input ActualizarSecuenciaInput {
    nombre: String
    descripcion: String
    secciones: [SeccionInput!]
    countIn: Boolean
    countInBeats: Int
    sonido: String
    volumen: Float
    ultimaAbierta: Boolean
  }

  input QuickSettingsInput {
    bpm: Int
    pulsaciones: Int
    subdivision: Int
    sonido: String
    volumen: Float
    a4Referencia: Int
  }

  input CrearPresetInput {
    nombre: String!
    descripcion: String
    esPublico: Boolean
    datos: JSON!
    etiquetas: [String]
  }

  input ActualizarPresetInput {
    nombre: String
    descripcion: String
    esPublico: Boolean
    esFavorito: Boolean
    esPorDefecto: Boolean
    datos: JSON
    etiquetas: [String]
  }

  # ── Tipos de retorno ──────────────────────────────────────

  type Compas {
    numerador: Int!
    denominador: Int!
  }

  type Tempo {
    tipo: String!
    bpm: Float
    inicio: Float
    fin: Float
    curva: String
  }

  type Seccion {
    seccionId: String!
    nombre: String!
    compas: Compas!
    tempo: Tempo!
    subdivision: Int!
    patronAcento: [Int]!
    repeticiones: Int!
  }

  type PracticeSequence {
    id: ID!
    nombre: String!
    descripcion: String
    secciones: [Seccion!]!
    countIn: Boolean!
    countInBeats: Int!
    sonido: String!
    volumen: Float!
    ultimaAbierta: Boolean!
    lastUsedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type MetronomeQuickSettings {
    id: ID!
    bpm: Int!
    pulsaciones: Int!
    subdivision: Int!
    sonido: String!
    volumen: Float!
    a4Referencia: Int!
    updatedAt: String!
  }

  type PracticePreset {
    id: ID!
    nombre: String!
    descripcion: String
    esPublico: Boolean!
    esFavorito: Boolean!
    esPorDefecto: Boolean!
    datos: JSON!
    etiquetas: [String]!
    vecesUsado: Int!
    lastUsedAt: String
    createdAt: String!
    # Solo para presets propios
    esPropio: Boolean!
  }

  # ── Queries ───────────────────────────────────────────────

  extend type Query {
    misSecuencias: [PracticeSequence!]!
    secuencia(id: ID!): PracticeSequence
    ultimaSecuencia: PracticeSequence
    misQuickSettings: MetronomeQuickSettings
    misPresets: [PracticePreset!]!
    presetsPublicos(limite: Int, offset: Int): [PracticePreset!]!
    preset(id: ID!): PracticePreset
  }

  # ── Mutations ─────────────────────────────────────────────

  extend type Mutation {
    crearSecuencia(input: CrearSecuenciaInput!): PracticeSequence!
    actualizarSecuencia(
      id: ID!
      input: ActualizarSecuenciaInput!
    ): PracticeSequence!
    eliminarSecuencia(id: ID!): Boolean!
    marcarUltimaSecuencia(id: ID!): PracticeSequence!

    guardarQuickSettings(input: QuickSettingsInput!): MetronomeQuickSettings!

    crearPreset(input: CrearPresetInput!): PracticePreset!
    actualizarPreset(id: ID!, input: ActualizarPresetInput!): PracticePreset!
    eliminarPreset(id: ID!): Boolean!
    usarPreset(id: ID!): PracticePreset!
  }

  scalar JSON
`;
