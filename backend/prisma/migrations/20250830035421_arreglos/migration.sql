-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ADD COLUMN     "receptorNombre" TEXT,
ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));
