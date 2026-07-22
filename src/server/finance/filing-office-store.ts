import type { FilingState } from "./filing-office-domain";
import {
  createInitialFilingState,
  validateFilingState,
} from "./filing-office-domain";
import { JsonFileStateRepository } from "./filing-office-repository.js";

export interface FilingOfficeStateRepository {
  load(): Promise<FilingState>;
  save(state: FilingState): Promise<void>;
  transact<Result>(work: (state: FilingState) => Promise<Result> | Result): Promise<Result>;
}

let repository: FilingOfficeStateRepository | undefined;

function allowInitialState() {
  if (process.env.SAIN_ALLOW_INITIAL_STATE === "true") return true;
  return process.env.NODE_ENV !== "production";
}

export function getFilingOfficeRepository(): FilingOfficeStateRepository {
  if (!repository) {
    repository = new JsonFileStateRepository({
      fileName: "filing-office.json",
      backupFileName: "filing-office.backup.json",
      validate: validateFilingState,
      createInitialState: createInitialFilingState,
      allowInitialState: allowInitialState(),
    });
  }
  return repository;
}

export function setFilingOfficeRepositoryForTesting(next?: FilingOfficeStateRepository) {
  repository = next;
}
