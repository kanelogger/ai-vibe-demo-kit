// brief.mjs — 低风险快路径 Brief 校验（PRD 11.2 / FR-U04）。
// 单 Slice、low 的 Feature/Bugfix/Maintenance 把连续前置事实收敛为一份 Brief 一次确认；
// 校验只检查事实完备性，不做产品判断（事实、判断与执行分离）。

import { E } from "./errors.mjs";

// 各类型 Brief 必需段、写入的事实种类与确认后的目标阶段。
export const BRIEF_SPEC = {
  feature: {
    sections: ["requirements", "design", "solution", "spec", "slice", "verification", "rollback"],
    facts: ["requirements", "design", "solution"],
  },
  bugfix: {
    sections: ["defect", "diagnosis", "solution", "slice", "verification", "rollback"],
    facts: ["defect", "diagnosis", "solution"],
  },
  maintenance: {
    sections: ["scope", "solution", "slice", "verification", "rollback"],
    facts: ["scope", "solution"],
  },
};

// 段内容的最小字段：空对象/空数组不允许冻结为事实（Rule：事实必须可判定完备）。
const COMMON_SECTION_FIELDS = {
  solution: ["summary"],
  slice: ["primaryUncertainty", "writeScope", "acceptanceCriteria"],
  verification: ["quick"],
  rollback: ["plan"],
};
const TYPE_SECTION_FIELDS = {
  feature: {
    requirements: ["goal", "scope"],
    design: ["behavior"],
    spec: ["inline"],
  },
  bugfix: {},
  maintenance: {},
};

function requireFields(section, fields, error) {
  const missing = fields.filter((field) => {
    const value = section?.[field];
    if (value === undefined || value === null) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === "string") return value.trim() === "";
    return false;
  });
  if (missing.length > 0) throw error(missing);
}

/**
 * 校验 Brief 完备性：缺段 → E_BRIEF_INCOMPLETE；
 * Bugfix 另有 defect/diagnosis 事实门禁（PRD 7.5），Maintenance 有 scope 门禁（PRD 7.6）。
 */
export function validateBrief(type, brief, item) {
  const spec = BRIEF_SPEC[type];
  if (!spec) throw E.BRIEF_NOT_ALLOWED(type, "该类型不支持 Brief 快路径");
  if (!brief || typeof brief !== "object" || Array.isArray(brief)) {
    throw E.BRIEF_INCOMPLETE(spec.sections, ["整个 Brief"]);
  }
  const missingSections = spec.sections.filter(
    (section) => brief[section] === undefined || brief[section] === null || typeof brief[section] !== "object",
  );
  if (missingSections.length > 0) throw E.BRIEF_INCOMPLETE(spec.sections, missingSections);

  const sectionFields = { ...COMMON_SECTION_FIELDS, ...TYPE_SECTION_FIELDS[type] };
  for (const [section, fields] of Object.entries(sectionFields)) {
    requireFields(brief[section], fields, (missing) =>
      E.BRIEF_INCOMPLETE(spec.sections, missing.map((field) => `${section}.${field}`)),
    );
  }

  if (type === "bugfix") {
    requireFields(brief.defect, ["contractRef", "reproduction"], (missing) => E.DEFECT_INCOMPLETE(missing));
    if (item.contractRef !== null && brief.defect.contractRef !== item.contractRef) {
      throw E.DEFECT_CONTRACT_MISMATCH(item.contractRef, brief.defect.contractRef);
    }
    requireFields(brief.diagnosis, ["causality", "evidence"], (missing) => E.DIAGNOSIS_INCOMPLETE(missing));
  }
  if (type === "maintenance") {
    requireFields(brief.scope, ["goal", "invariants", "riskProfile", "rollbackBoundary"], (missing) => E.SCOPE_INCOMPLETE(missing));
  }
  return spec;
}
