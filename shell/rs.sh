cd ~/tools/tools || exit
git pull https://github.com/gjp0609/tools.git master
source /etc/profile.d/jdk11.sh
mvn clean package -DskipTests -P server
kill -9 $(ps -ef | grep tools | grep -v "grep" | awk '{print $2}')
cd ~/tools || exit
nohup java -jar tools/target/tools.jar &
