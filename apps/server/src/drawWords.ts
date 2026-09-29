// Original PT-BR starter collection, authored for Lumio; no external word API.
export const drawWords = [
  "abacaxi", "abelha", "abraço", "acampamento", "avião", "balanço", "baleia", "balão", "banana", "barco", "bicicleta", "biscoito", "bola", "borboleta", "bota", "cachoeira", "cadeira", "café", "cama", "caminhão", "camisa", "castelo", "cenoura", "chapéu", "chuva", "cinema", "coração", "coruja", "cozinha", "escada", "escova", "espelho", "estrela", "farol", "foguete", "fogão", "formiga", "galinha", "gato", "girafa", "girassol", "golfinho", "guarda-chuva", "hambúrguer", "helicóptero", "ilha", "janela", "jardim", "lâmpada", "lápis", "leão", "livro", "lua", "luva", "macaco", "maçã", "maleta", "mapa", "martelo", "melancia", "mochila", "montanha", "morango", "navio", "nuvem", "óculos", "ônibus", "ovo", "palhaço", "panela", "papagaio", "patins", "peixe", "pinguim", "pipoca", "pizza", "ponte", "porta", "praia", "presente", "queijo", "rádio", "relógio", "robô", "rosa", "sapato", "sapo", "semáforo", "sino", "sofá", "sol", "sorvete", "tartaruga", "telefone", "tesoura", "tigre", "tomate", "trem", "trompete", "urso", "uva", "vassoura", "vela", "violão", "vulcão", "zebra", "árvore", "cachorro", "coelho", "dinossauro", "floresta", "pipa", "pirata", "poncho", "prancha", "raquete", "rede", "tenda", "torre", "trator",
] as const;

// Original additions and categorization. The bank stays on the server.
const animals = "abelha baleia borboleta coruja formiga galinha gato girafa golfinho leão macaco papagaio peixe pinguim sapo tartaruga tigre urso zebra cachorro coelho dinossauro elefante cavalo jacaré polvo caranguejo tubarão".split(" ");
const food = "abacaxi banana biscoito café cenoura hambúrguer maçã melancia morango ovo pipoca pizza queijo sorvete tomate uva pão bolo macarrão feijão arroz limão laranja pera coco chocolate mel batata".split(" ");
const nature = "cachoeira chuva estrela girassol lua montanha nuvem rosa sol vulcão árvore floresta arco-íris raio neve rio lago onda pedra folha flor cogumelo cacto concha areia vento gelo grama".split(" ");
const places = "acampamento castelo cinema cozinha farol ilha jardim ponte praia tenda torre escola hospital biblioteca mercado estádio parque museu aeroporto estação garagem piscina fazenda padaria praça igreja zoológico deserto".split(" ");
const assigned = new Set([...animals, ...food, ...nature, ...places]);
const daily = [...drawWords.filter((word) => !assigned.has(word)), ..."garfo colher escudo capacete teclado computador violino mochila".split(" ")];
export const drawWordBanks = { animals, food, nature, places, daily: [...new Set(daily)] } as const;
export const allDrawWords = [...new Set(Object.values(drawWordBanks).flat())];
