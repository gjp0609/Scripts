cd /my/tools/tools || exit
git pull https://username:password@github.com/gjp0609/tools.git master
source /etc/profile.d/jdk11.sh
mvn clean package -DskipTests
kill -9 $(ps -ef | grep tools | grep -v "grep" | awk '{print $2}')
cd /my/tools || exit
nohup java -jar tools/target/tools.jar &
