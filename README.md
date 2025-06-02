# Bot de Trading para Binance (USDT/BRL)

Este é um robô automatizado para operar criptomoedas na Binance, especificamente o par USDT/BRL, baseado na estratégia do Índice de Força Relativa (IFR/RSI).

## Estratégia

O robô segue a seguinte estratégia:

1. **Compra**: Quando o fechamento do último candle no gráfico diário estiver abaixo do nível 30 no indicador IFR, o robô compra USDT usando 50% do valor em BRL disponível na conta.

2. **Venda**: Depois de comprado, quando a máxima do candle atingir a abertura do candle anterior, o robô vende todo o USDT para BRL.

## Requisitos

- Node.js (versão 14 ou superior)
- Conta na Binance com permissões de API para trading

## Instalação

1. Clone este repositório:
```
git clone [url-do-repositório]
cd bot-cripto
```

2. Instale as dependências:
```
npm install
```

3. Configure o arquivo `.env` com suas credenciais da Binance:
```
BINANCE_API_KEY=sua_api_key_aqui
BINANCE_API_SECRET=sua_api_secret_aqui
TRADE_AMOUNT_PERCENT=50
RSI_THRESHOLD=30
```

## Uso

Para iniciar o robô:

```
npm start
```

O robô irá:
- Verificar o RSI atual do par USDT/BRL
- Executar a estratégia de compra/venda conforme as condições
- Registrar todas as operações no console e em um arquivo de log

## Logs

Todas as ações realizadas, erros e mensagens são registrados:
- No console
- No arquivo `bot.log`

## Segurança

- As credenciais da API são armazenadas no arquivo `.env` (não incluído no controle de versão)
- Certifique-se de criar chaves API com permissões limitadas apenas para trading

## Aviso

Este robô é fornecido apenas para fins educacionais. Opere criptomoedas por sua conta e risco. Sempre teste em ambiente de simulação antes de usar com fundos reais.
