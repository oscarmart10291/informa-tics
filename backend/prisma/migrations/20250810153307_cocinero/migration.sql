-- AlterTable
ALTER TABLE "public"."Orden" ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'En espera',
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));
