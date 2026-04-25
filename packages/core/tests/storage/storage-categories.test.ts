import { describe, it, expect } from "vitest";
import { classifyTable } from "../../src/storage/storage-categories.js";

describe("classifyTable", () => {
  it("classifies knowledge_notes as 'notes'", () => {
    expect(classifyTable("knowledge_notes")).toBe("notes");
  });

  it("classifies extracted_patterns and problem_solution_pairs as 'notes'", () => {
    expect(classifyTable("extracted_patterns")).toBe("notes");
    expect(classifyTable("problem_solution_pairs")).toBe("notes");
    expect(classifyTable("note_links")).toBe("notes");
  });

  it("classifies FTS shadow tables of knowledge_notes as 'fts'", () => {
    expect(classifyTable("knowledge_notes_fts")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_data")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_idx")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_content")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_docsize")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_config")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_trigram")).toBe("fts");
    expect(classifyTable("knowledge_notes_fts_trigram_data")).toBe("fts");
  });

  it("classifies note_embeddings and vec0 as 'embeddings'", () => {
    expect(classifyTable("note_embeddings")).toBe("embeddings");
    expect(classifyTable("note_embeddings_vec")).toBe("embeddings");
    expect(classifyTable("note_embeddings_vec_chunks")).toBe("embeddings");
    expect(classifyTable("note_embeddings_vec_rowids")).toBe("embeddings");
    expect(classifyTable("note_embeddings_vec_vector_chunks00")).toBe("embeddings");
  });

  it("classifies graph tables and entity FTS as 'graph'", () => {
    expect(classifyTable("entities")).toBe("graph");
    expect(classifyTable("relations")).toBe("graph");
    expect(classifyTable("observations")).toBe("graph");
    expect(classifyTable("entity_note_links")).toBe("graph");
    expect(classifyTable("entities_fts")).toBe("graph");
    expect(classifyTable("entities_fts_data")).toBe("graph");
    expect(classifyTable("entities_fts_idx")).toBe("graph");
  });

  it("classifies events-related tables as 'events'", () => {
    expect(classifyTable("events")).toBe("events");
    expect(classifyTable("ingest_cursors")).toBe("events");
    expect(classifyTable("provenance")).toBe("events");
    expect(classifyTable("file_timeline")).toBe("events");
    expect(classifyTable("extraction_feedback")).toBe("events");
  });

  it("routes memory_entries_fts to 'memory' (prefix wins over fts suffix)", () => {
    expect(classifyTable("memory_entries")).toBe("memory");
    expect(classifyTable("memory_entries_fts")).toBe("memory");
    expect(classifyTable("memory_entries_fts_data")).toBe("memory");
    expect(classifyTable("memory_entries_fts_idx")).toBe("memory");
    expect(classifyTable("memory_entries_fts_config")).toBe("memory");
  });

  it("classifies sqlite internal/migration tables as 'other'", () => {
    expect(classifyTable("sqlite_schema")).toBe("other");
    expect(classifyTable("sqlite_sequence")).toBe("other");
    expect(classifyTable("schema_migrations")).toBe("other");
  });

  it("classifies unknown tables as 'other'", () => {
    expect(classifyTable("definitely_not_a_real_table")).toBe("other");
  });

  it("classifies idx_<table>_<column> indexes into the owning table's category", () => {
    expect(classifyTable("idx_note_embeddings_model")).toBe("embeddings");
    expect(classifyTable("idx_knowledge_notes_created_at")).toBe("notes");
    expect(classifyTable("idx_knowledge_notes_deprecated")).toBe("notes");
    expect(classifyTable("idx_entities_name")).toBe("graph");
    expect(classifyTable("idx_entities_normalized")).toBe("graph");
    expect(classifyTable("idx_relations_from")).toBe("graph");
    expect(classifyTable("idx_observations_entity")).toBe("graph");
    expect(classifyTable("idx_entity_note_links_note")).toBe("graph");
    expect(classifyTable("idx_events_type")).toBe("events");
    expect(classifyTable("idx_provenance_entity")).toBe("events");
    expect(classifyTable("idx_file_timeline_path")).toBe("events");
    expect(classifyTable("idx_memory_entries_layer")).toBe("memory");
    expect(classifyTable("idx_extracted_patterns_note_id")).toBe("notes");
  });

  it("classifies sqlite_autoindex_<table>_<n> into the owning table's category", () => {
    expect(classifyTable("sqlite_autoindex_knowledge_notes_1")).toBe("notes");
    expect(classifyTable("sqlite_autoindex_note_embeddings_1")).toBe("embeddings");
    expect(classifyTable("sqlite_autoindex_entities_1")).toBe("graph");
  });

  it("falls back to 'other' for index-shaped names with unknown table owners", () => {
    expect(classifyTable("idx_some_unknown_table_col")).toBe("other");
    expect(classifyTable("sqlite_autoindex_unknown_table_1")).toBe("other");
  });
});
