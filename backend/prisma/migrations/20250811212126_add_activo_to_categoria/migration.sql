-- AlterTable
ALTER TABLE "public"."Categoria" ADD COLUMN     "activo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));
