import type { RelationType, EntityType } from "../types.js";

export interface InferredRelation {
  fromName: string;
  fromType: EntityType;
  toName: string;
  toType: EntityType;
  relationType: RelationType;
  strength: number;
}

export class RelationInferrer {
  /**
   * 同一ノート内のエンティティ群から関係を推論する。
   *
   * @param entities - ノートから抽出されたエンティティ（name + entityType）
   * @param frontmatter - フロントマターデータ
   */
  infer(
    entities: Array<{ name: string; entityType: EntityType }>,
    frontmatter: Record<string, unknown> = {},
  ): InferredRelation[] {
    const results: InferredRelation[] = [];

    const persons = entities.filter((e) => e.entityType === "person");
    const projects = entities.filter((e) => e.entityType === "project");
    const technologies = entities.filter(
      (e) => e.entityType === "technology" || e.entityType === "tool",
    );

    // author → project: created_by
    const author = frontmatter["author"];
    const projectName = frontmatter["project"];
    if (
      typeof author === "string" &&
      author.trim() &&
      typeof projectName === "string" &&
      projectName.trim()
    ) {
      results.push({
        fromName: author.trim().toLowerCase(),
        fromType: "person",
        toName: projectName.trim().toLowerCase(),
        toType: "project",
        relationType: "created_by",
        strength: 0.9,
      });
    }

    // person → project: works_on (from frontmatter project field)
    if (typeof projectName === "string" && projectName.trim()) {
      for (const person of persons) {
        if (person.name !== author?.toString().toLowerCase()) {
          results.push({
            fromName: person.name,
            fromType: "person",
            toName: projectName.trim().toLowerCase(),
            toType: "project",
            relationType: "works_on",
            strength: 0.7,
          });
        }
      }
    }

    // import → depends_on: technology depends on other technology
    // (This is simplified: if note has multiple imports, they co-occur in same context)
    // technology → project: uses (project uses technology when co-occurring)
    for (const project of projects) {
      for (const tech of technologies) {
        results.push({
          fromName: project.name,
          fromType: "project",
          toName: tech.name,
          toType: tech.entityType,
          relationType: "uses",
          strength: 0.5,
        });
      }
    }

    // technology depends_on: inferred from import patterns (same note)
    // Only if there are multiple technologies
    if (technologies.length >= 2) {
      for (let i = 0; i < technologies.length; i++) {
        for (let j = i + 1; j < technologies.length; j++) {
          results.push({
            fromName: technologies[i].name,
            fromType: technologies[i].entityType,
            toName: technologies[j].name,
            toType: technologies[j].entityType,
            relationType: "related_to",
            strength: 0.3,
          });
        }
      }
    }

    return this.deduplicate(results);
  }

  private deduplicate(relations: InferredRelation[]): InferredRelation[] {
    const seen = new Map<string, InferredRelation>();
    for (const r of relations) {
      const key = `${r.fromName}:${r.fromType}→${r.toName}:${r.toType}:${r.relationType}`;
      const existing = seen.get(key);
      if (!existing || r.strength > existing.strength) {
        seen.set(key, r);
      }
    }
    return Array.from(seen.values());
  }
}
