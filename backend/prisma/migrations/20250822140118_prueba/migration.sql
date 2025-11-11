-- CreateEnum
CREATE TYPE "public"."CategoriaTipo" AS ENUM ('COMESTIBLE', 'BEBIBLE');

-- AlterTable
ALTER TABLE "public"."Categoria" ADD COLUMN     "tipo" "public"."CategoriaTipo" NOT NULL DEFAULT 'COMESTIBLE';

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));
