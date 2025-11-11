-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."PedidoCliente" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(5) NOT NULL DEFAULT upper(substr(md5(random()::text),1,5)),
    "clienteEmail" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "tipoEntrega" TEXT NOT NULL,
    "metodoPago" TEXT NOT NULL,
    "direccion" TEXT,
    "telefono" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PedidoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PedidoClienteItem" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "platilloId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "nota" TEXT,

    CONSTRAINT "PedidoClienteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCliente_codigo_key" ON "public"."PedidoCliente"("codigo");

-- CreateIndex
CREATE INDEX "PedidoCliente_clienteEmail_creadoEn_idx" ON "public"."PedidoCliente"("clienteEmail", "creadoEn");

-- AddForeignKey
ALTER TABLE "public"."PedidoClienteItem" ADD CONSTRAINT "PedidoClienteItem_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "public"."PedidoCliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
