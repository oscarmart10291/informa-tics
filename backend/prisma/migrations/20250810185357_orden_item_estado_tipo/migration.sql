-- CreateEnum
CREATE TYPE "public"."ItemEstado" AS ENUM ('PENDIENTE', 'PREPARANDO', 'LISTO');

-- CreateEnum
CREATE TYPE "public"."ItemTipo" AS ENUM ('PLATILLO', 'BEBIDA');

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."OrdenItem" ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "estado" "public"."ItemEstado" NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "tipo" "public"."ItemTipo" NOT NULL DEFAULT 'PLATILLO';
