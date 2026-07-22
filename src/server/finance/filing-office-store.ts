import type { FilingState } from "./filing-office-domain";
import {
  createInitialFilingState,
  validateFilingState,
} from "./filing-office-domain";
import { DatabaseStateRepository } from "./database-state-repository.js";
import { JsonFileStateRepository } from "./filing-office-repository.js";
import { PostgresDatabase } from "./postgres-database";

export interface FilingOfficeStateRepository {
  load(): Promise<FilingState>;
  save(state: FilingState): Promise<void>;
  transact<Result>(work: (state: FilingState) => Promise<Result> | Result): Promise<Result>;
}

let repository: FilingOfficeStateRepository | undefined;

function allowInitialState() {
  return process.env.SAIN_ALLOW_INITIAL_STATE === "true";
}

function useJsonRepository() {
  return process.env.SAIN_FILING_OFFICE_REPOSITORY === "json";
}

function createRepository(): FilingOfficeStateRepository {
  if (useJsonRepository()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JSON_FILING_OFFICE_REPOSITORY_DISABLED_IN_PRODUCTION");
    }
    return new JsonFileStateRepository({
      fileName: "filing-office.json",
      backupFileName: "filing-office.backup.json",
      validate: validateFilingState,
      createInitialState: createInitialFilingState,
      allowInitialState: allowInitialState(),
    });
  }

  return new DatabaseStateRepository({
    database: new PostgresDatabase(),
    validate: validateFilingState,
    createInitialState: createInitialFilingState,
    allowInitialState: allowInitialState(),
    institutionKey: process.env.SAIN_INSTITUTION_KEY || "sain-finance",
  });
}

export function getFilingOfficeRepository(): FilingOfficeStateRepository {
  repository ??= createRepository();
  return repository;
}

export function setFilingOfficeRepositoryForTesting(next?: FilingOfficeStateRepository) {
  repository = next;
}
