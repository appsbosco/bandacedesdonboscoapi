import { typeDefs } from "./typeDefs.js";
import { queries } from "./resolvers/queries.js";
import { mutations } from "./resolvers/mutations.js";
import { types } from "./resolvers/types.js";

export const practiceToolsModule = {
  typeDefs,
  resolvers: {
    Query: queries,
    Mutation: mutations,
    ...types,
  },
};
