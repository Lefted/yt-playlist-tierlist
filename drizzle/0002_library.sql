CREATE TABLE "playlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"channel_title" text DEFAULT '' NOT NULL,
	"thumbnail" text DEFAULT '' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "playlists_user_id_youtube_id_key" UNIQUE("user_id","youtube_id")
);
--> statement-breakpoint
CREATE TABLE "user_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"active_playlist_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"playlist_id" uuid NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"thumbnail" text DEFAULT '' NOT NULL,
	"channel_title" text DEFAULT '' NOT NULL,
	"published_at" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"rating" text,
	"unavailable" boolean DEFAULT false NOT NULL,
	"rated_at" timestamp with time zone,
	CONSTRAINT "videos_playlist_id_youtube_id_key" UNIQUE("playlist_id","youtube_id"),
	CONSTRAINT "videos_rating_check" CHECK ("videos"."rating" in ('S', 'A', 'B', 'C', 'D', 'F'))
);
--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_state" ADD CONSTRAINT "user_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_state" ADD CONSTRAINT "user_state_active_playlist_id_playlists_id_fk" FOREIGN KEY ("active_playlist_id") REFERENCES "public"."playlists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;