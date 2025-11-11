-- AlterTable
ALTER TABLE "public"."Orden" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- AlterTable
ALTER TABLE "public"."PedidoCliente" ALTER COLUMN "codigo" SET DEFAULT upper(substr(md5(random()::text),1,5));

-- CreateTable
CREATE TABLE "public"."CalificacionPedido" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "comida" INTEGER NOT NULL,
    "repartidor" INTEGER,
    "atencionCliente" INTEGER,
    "comentario" TEXT,
    "comidaOpciones" JSONB,
    "repartidorOpciones" JSONB,
    "atencionOpciones" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalificacionPedido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalificacionPedido_pedidoId_key" ON "public"."CalificacionPedido"("pedidoId");

-- AddForeignKey
ALTER TABLE "public"."CalificacionPedido" ADD CONSTRAINT "CalificacionPedido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "public"."PedidoCliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
