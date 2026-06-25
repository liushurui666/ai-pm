import { config as loadEnv } from "dotenv";
import { hasFeishuAppConfig } from "@/lib/feishu/client";
import { listFeishuPeopleWithDiagnostics } from "@/lib/feishu/users";
import type { FeishuPerson } from "@/types/dashboard";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const MIN_EXPECTED_PEOPLE = Number(process.env.AI_PM_QA_FEISHU_MIN_PEOPLE || "10");

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function findSearchProbe(people: FeishuPerson[]) {
  return people.find((person) => person.name.trim().length >= 2) ?? people[0];
}

async function verifyFeishuContacts() {
  assertSmoke(hasFeishuAppConfig(), "缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET，无法验证飞书通讯录真实链路。");

  const fullResult = await listFeishuPeopleWithDiagnostics("");
  const people = fullResult.people;
  const openIds = people.map((person) => person.openId).filter(Boolean);
  const uniqueOpenIds = uniqueValues(openIds);
  const peopleWithEmail = people.filter((person) => Boolean(person.email));
  const peopleWithAvatar = people.filter((person) => Boolean(person.avatarUrl));
  const searchProbe = findSearchProbe(people);

  // “添加成员只能看到少数人”通常不是前端 Select 问题，而是授权范围、用户组权限或子部门分页展开问题。
  // 这里直接打通飞书通讯录聚合函数，要求数量达到预期、无用户组读取 warning、open_id 去重且形态正确。
  assertSmoke(people.length >= MIN_EXPECTED_PEOPLE, `飞书通讯录人数过少：expected>=${MIN_EXPECTED_PEOPLE}, actual=${people.length}`);
  assertSmoke(!fullResult.warning, `飞书通讯录返回 warning：${fullResult.warning}`);
  assertSmoke(openIds.length === people.length, "飞书通讯录存在缺少 openId 的成员。");
  assertSmoke(uniqueOpenIds.length === openIds.length, "飞书通讯录 openId 去重失败，添加成员下拉可能出现重复人。");
  assertSmoke(openIds.every((openId) => openId.startsWith("ou_")), "飞书通知目标必须是 ou_ 开头的 open_id。");
  assertSmoke(Boolean(searchProbe), "飞书通讯录为空，无法验证搜索过滤。");

  const keyword = searchProbe.name.slice(0, Math.min(2, searchProbe.name.length));
  const searchResult = await listFeishuPeopleWithDiagnostics(keyword);

  // 搜索结果必须仍来自同一批可通知成员，不能因为前端 query 走了另一条不含用户组/子部门的读取路径。
  assertSmoke(searchResult.people.length > 0, `飞书通讯录搜索 ${keyword} 未返回成员。`);
  assertSmoke(!searchResult.warning, `飞书通讯录搜索返回 warning：${searchResult.warning}`);
  assertSmoke(searchResult.people.some((person) => person.openId === searchProbe.openId), "飞书通讯录搜索未包含探针成员。");
  assertSmoke(searchResult.people.every((person) => uniqueOpenIds.includes(person.openId)), "飞书通讯录搜索结果包含全量列表之外的成员。");

  return {
    count: people.length,
    minExpectedPeople: MIN_EXPECTED_PEOPLE,
    peopleWithEmail: peopleWithEmail.length,
    peopleWithAvatar: peopleWithAvatar.length,
    search: {
      keyword,
      count: searchResult.people.length,
      probeMatched: searchResult.people.some((person) => person.openId === searchProbe.openId)
    },
    sampleNames: people.slice(0, 5).map((person) => person.name),
    warning: fullResult.warning ?? ""
  };
}

verifyFeishuContacts()
  .then((contacts) => {
    console.log(JSON.stringify({
      ok: true,
      contacts
    }, null, 2));
  })
  .catch((error) => {
    console.error("[full-chain-feishu-contact-smoke] failed", error);
    process.exitCode = 1;
  });
