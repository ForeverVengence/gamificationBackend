module.exports = {
  HOST: "metalms.cvqnm43wjv7w.ap-southeast-2.rds.amazonaws.com",
  USER: "postgres",
  PASSWORD: "30091997Ra",
  DB: "apiGateway",
  dialect: "postgres",
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
};