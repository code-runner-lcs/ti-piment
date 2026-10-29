import { DataSource } from "typeorm";
import { config } from "./config";
import { User } from "./entities/user.entity";
import { InitialMigration1793145600000 } from "./migrations/0001-initial";
import { ProfilesPhotosPreferences1793222400000 } from "./migrations/0002-profiles";
import { SwipesMatchesBlocks1793318400000 } from "./migrations/0003-discovery";
import { ChatModeration1793491200000 } from "./migrations/0005-chat";
import { GeoCities1793404800000 } from "./migrations/0004-geo";
import { RefreshToken } from "./entities/refresh-token.entity";
import { Profile } from "./entities/profile.entity";
import { Preference } from "./entities/preference.entity";
import { Photo } from "./entities/photo.entity";
import { Swipe } from "./entities/swipe.entity";
import { Match } from "./entities/match.entity";
import { Block } from "./entities/block.entity";
import { Message } from "./entities/message.entity";
import { Report } from "./entities/report.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: config.pg.host,
  port: config.pg.port,
  username: config.pg.user,
  password: config.pg.password,
  database: config.pg.database,
  entities: [User, RefreshToken, Profile, Preference, Photo, Swipe, Match, Block, Message, Report],
  migrations: [InitialMigration1793145600000, ProfilesPhotosPreferences1793222400000, SwipesMatchesBlocks1793318400000, GeoCities1793404800000, ChatModeration1793491200000],
  logging: ["error", "migration"],
});

export default AppDataSource;
