import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const sharedSettings=sqliteTable('shared_settings',{id:text('id').primaryKey(),encrypted:text('encrypted').notNull(),updatedAt:text('updated_at').notNull()});
export const quotas=sqliteTable('trial_quotas',{bucket:text('bucket').primaryKey(),day:text('day').notNull(),count:integer('count').notNull()});
