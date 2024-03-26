const express = require("express");
const port = 5000;
const app = express();
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config();
const path = require("path");

app.use(express.static("./views"));
app.set("view engine", "ejs");
app.set("views", "./views");

process.env.AWS_SDK_JS_MAINTENACE_MODE_MESSAGE = "1";

//cau hinh aws de truy cap cloud
AWS.config.update({
  region: process.env.REGION,
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
});
const bucketName = process.env.S3_BUCKET_NAME;
const tableName = process.env.DYNAMODB_TABLE_NAME;

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

//cau hinh multer quan ly image
const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, "");
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2000000 },
  fileFilter(req, file, cb) {
    checkFileType(file, cb);
  },
});
function checkFileType(file, cb) {
  // const fileTypes = /jpeg|png|jpg|gif/;
  const fileTypes = /jpeg|jpg|png|gif/;

  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error pls upload image /jpeg|png|jpg|gif /");
}

app.get("/", async (req, res) => {
  try {
    const params = { TableName: tableName };
    const data = await dynamodb.scan(params).promise();
    console.log("data=", data.Items);
    return res.render("index.ejs", { data: data.Items });
  } catch (error) {
    console.log("Error Retrieving data from DynamoDb:", error);
    return res.status(500).send("Internal Server Error!");
  }
});

app.post("/save", upload.single("image"), (req, res) => {
  try {
    const maCongNhan = Number(req.body.maCongNhan);
    const tenCongNhan = req.body.tenCongNhan;
    const soDienThoai = Number(req.body.soDienThoai);
    const diaChi = req.body.diaChi;
    const image = req.file.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${maCongNhan}_${Date.now().toString()}.${fileType}`;

    const paramS3 = {
      Bucket: bucketName,
      Key: filePath,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    s3.upload(paramS3, async (err, data) => {
      if (err) {
        console.error("Error =", err);
        return res.send("Internal Server Error!");
      } else {
        const imageURL = data.Location;
        const paramsDynamoDb = {
          TableName: tableName,
          Item: {
            maCongNhan: Number(maCongNhan),
            tenCongNhan: tenCongNhan,
            soDienThoai: Number(soDienThoai),
            diaChi: diaChi,
            image: imageURL,
          },
        };
        await dynamodb.put(paramsDynamoDb).promise();
        return res.redirect("/"); // render lai trang index sau khi cap nhat table
      }
    });
  } catch (error) {
    console.log("Error saving data", error);
    return res.status(500).send("Internal Server Error!");
  }
});
app.post("/delete", upload.fields([]), (req, res) => {
  const listCheckBox = Object.keys(req.body);
  if (!listCheckBox || listCheckBox.length <= 0) {
    return res.redirect("/");
  }
  try {
    function onDeleteItem(length) {
      const params = {
        TableName: tableName,
        Key: {
          maCongNhan: Number(listCheckBox[length]),
        },
      };
      dynamodb.delete(params, (err, data) => {
        if (err) {
          console.error("error", err);
          return res.send("Internal Server Error");
        } else if (length > 0) {
          onDeleteItem(length - 1);
        } else {
          return res.redirect("/");
        }
      });
    }
    onDeleteItem(listCheckBox.length - 1);
  } catch (error) {
    console.error("Error deleting data from DynamoDb", error);
    return res.status(500).send("Internal");
  }
});
app.listen(5000, () => {
  console.log("running on port 5000");
});
