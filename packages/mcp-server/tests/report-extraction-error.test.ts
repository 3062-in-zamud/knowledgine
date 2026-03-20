import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKnowledgineMcpServer } from "../src/server.js";
import { createTestDb, seedTestData } from "./helpers/test-db.js";
import type { TestContext } from "./helpers/test-db.js";
import { FeedbackRepository } from "@knowledgine/core";

describe("report_extraction_error tool", () => {
  let ctx: TestContext;
  let client: Client;
  let feedbackRepository: FeedbackRepository;

  beforeEach(async () => {
    ctx = createTestDb();
    seedTestData(ctx.repository);
    feedbackRepository = new FeedbackRepository(ctx.db);

    const server = createKnowledgineMcpServer({
      repository: ctx.repository,
      feedbackRepository,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: "test-client", version: "0.0.1" });

    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(() => {
    ctx.db.close();
  });

  it("should create feedback for false_positive", async () => {
    const result = await client.callTool({
      name: "report_extraction_error",
      arguments: {
        entityName: "react",
        errorType: "false_positive",
      },
    });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.message).toBe("Feedback recorded successfully");
    expect(data.feedback.entityName).toBe("react");
    expect(data.feedback.errorType).toBe("false_positive");
    expect(data.feedback.status).toBe("pending");
  });

  it("should create feedback for wrong_type", async () => {
    const result = await client.callTool({
      name: "report_extraction_error",
      arguments: {
        entityName: "typescript",
        errorType: "wrong_type",
        entityType: "tool",
        correctType: "technology",
        details: "TypeScript should be technology",
      },
    });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.feedback.errorType).toBe("wrong_type");
    expect(data.feedback.entityType).toBe("tool");
    expect(data.feedback.correctType).toBe("technology");
    expect(data.feedback.details).toBe("TypeScript should be technology");
  });

  it("should create feedback for missed_entity with noteId", async () => {
    const result = await client.callTool({
      name: "report_extraction_error",
      arguments: {
        entityName: "vitest",
        errorType: "missed_entity",
        correctType: "technology",
        noteId: 1,
      },
    });
    expect(result.isError).toBeFalsy();

    const content = result.content as Array<{ type: string; text: string }>;
    const data = JSON.parse(content[0].text);
    expect(data.feedback.errorType).toBe("missed_entity");
    expect(data.feedback.noteId).toBe(1);
  });

  it("should persist feedback in the database", async () => {
    await client.callTool({
      name: "report_extraction_error",
      arguments: {
        entityName: "test-entity",
        errorType: "false_positive",
      },
    });

    const records = feedbackRepository.list();
    expect(records).toHaveLength(1);
    expect(records[0].entityName).toBe("test-entity");
  });

  it("should return error when feedbackRepository is not available", async () => {
    // Create server without feedbackRepository
    const server = createKnowledgineMcpServer({
      repository: ctx.repository,
    });
    const [clientTransport2, serverTransport2] = InMemoryTransport.createLinkedPair();
    const client2 = new Client({ name: "test-client-2", version: "0.0.1" });
    await server.connect(serverTransport2);
    await client2.connect(clientTransport2);

    const result = await client2.callTool({
      name: "report_extraction_error",
      arguments: {
        entityName: "test",
        errorType: "false_positive",
      },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("Feedback system is not available");
  });
});
