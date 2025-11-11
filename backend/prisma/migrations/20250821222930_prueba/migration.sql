-- DropForeignKey
ALTER TABLE "public"."Orden" DROP CONSTRAINT "Orden_meseroId_fkey";

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "meseroId" DROP NOT NULL,
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AddForeignKey
ALTER TABLE "public"."Orden" ADD CONSTRAINT "Orden_meseroId_fkey" FOREIGN KEY ("meseroId") REFERENCES "public"."Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
