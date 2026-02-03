import { UnitOfWork } from './UnitOfWork';

export type UnitOfWorkResult = {
  work: UnitOfWork;
  persisted: boolean;
  publishedStatus: boolean;
};
