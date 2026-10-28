import { DataSource } from "typeorm";
import { config } from "./config";
import { User } from "./entities/user.entity";
import { InitialMigration1793145600000 } from "./migrations/0001-initial";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: config.pg.host,
  port: config.pg.port,
  username: config.pg.user,
  password: config.pg.password,
  database: config.pg.database,
  entities: [User],
  migrations: [InitialMigration1793145600000],
  logging: ["error", "migration"],
});

// Le CLI TypeORM (-d) résout par l'export par défaut
export default AppDataSource;
