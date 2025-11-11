-- AlterEnum
ALTER TYPE "public"."CajaTurnoEstado" ADD VALUE 'CIERRE_PENDIENTE';

-- AlterTable
ALTER TABLE "public"."CajaTurno" ADD COLUMN     "cierreAutorizadoEn" TIMESTAMP(3),
ADD COLUMN     "cierreAutorizadoPorId" INTEGER,
ADD COLUMN     "cierreSolicitadoEn" TIMESTAMP(3),
ADD COLUMN     "conteoFinal" JSONB,
ADD COLUMN     "montoCierre" DOUBLE PRECISION,
ALTER COLUMN "montoApertura" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));
