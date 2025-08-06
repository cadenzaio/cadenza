// Define supported primitive types
export type SchemaType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "null"
  | "any";

// Define constraints for each type
export type SchemaConstraints = {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  multipleOf?: number;
  format?: "email" | "url" | "date-time" | "uuid" | "custom";
  oneOf?: any[];
  // Add more as needed (e.g., exclusiveMin, allOf)
};

// Recursive schema definition for nested structures
export type SchemaDefinition = {
  type: SchemaType;
  required?: string[]; // For objects
  properties?: { [key: string]: SchemaDefinition }; // For objects
  items?: SchemaDefinition; // For arrays
  constraints?: SchemaConstraints;
  description?: string; // Optional for docs
};
