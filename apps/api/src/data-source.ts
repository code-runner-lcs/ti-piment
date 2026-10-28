import { DataSource } from "typeorm";
import { config } from "./config";
import { User } from "./entities/user.entity";
import { InitialMigration1793145600000 } from "./migrations/0001-initial";
import { ProfilesPhotosPreferences1793222400000 } from "./migrations/0002-profiles";
import { RefreshToken } from "./entities/refresh-token.entity";
import { Profile } from "./entities/profile.entity";
import { Preference } from "./entities/preference.entity";
import { Photo } from "./entities/photo.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: config.pg.host,
  port: config.pg.port,
  username: config.pg.user,
  password: config.pg.password,
  database: config.pg.database,
  entities: [User, RefreshToken, Profile, Preference, Photo],
  migrations: [InitialMigration1793145600000, ProfilesPhotosPreferences1793222400000],
  logging: ["error", "migration"],
});

// Le testeur vitest et le CLI de typecheck consomment cet export par défaut
export default AppDataSource;
