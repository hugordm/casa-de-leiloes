// Os e-mails desativados geram um console.info por envio ignorado (comportamento pedido).
// Nos testes isso só polui a saída; quem precisa verificar o log usa jest.spyOn.
beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});
