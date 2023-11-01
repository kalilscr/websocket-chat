import { container } from "tsyringe";
import { io } from "../http";
import { CreateUserService } from "../services/CreateUserService";
import { GetAllUsersService } from "../services/GetAllUsersService";
import { CreateChatRoomService } from "../services/CreateChatRoomService";
import { GetUserBySocketIdService } from "../services/GetUserBySocketIdService";
import { GetChatRoomByUserService } from "../services/GetChatRoomByUserService";
import { GetMessagesByChatRoomService } from "../services/GetMessagesByChatRoomService";
import { CreateMessageService } from "../services/CreateMessageService";
import { GetChatRoomByIdService } from "../services/GetChatRoomByIdService";

interface ChatStart {
  email: string;
  name: string;
  avatar: string;
}

io.on("connect", (socket) => {
  socket.on("start", async (data: ChatStart) => {
    const { email, avatar, name } = data;
    const createUserService = container.resolve(CreateUserService);

    const user = await createUserService.execute({
      email,
      avatar,
      name,
      socket_id: socket.id,
    });

    socket.broadcast.emit("new_users", user);
  });

  socket.on("get_users", async (callback) => {
    const getAllUsersService = container.resolve(GetAllUsersService);
    const users = await getAllUsersService.execute();

    callback(users);
  });

  socket.on("start_chat", async (data, callback) => {
    const createChatRoomService = container.resolve(CreateChatRoomService);
    const getChatRoomByUsersService = container.resolve(
      GetChatRoomByUserService
    );
    const getUserBySocketIdService = container.resolve(
      GetUserBySocketIdService
    );
    const getMessagesByChatRoomService = container.resolve(
      GetMessagesByChatRoomService
    );

    const userLogged = await getUserBySocketIdService.execute(socket.id);

    let room = await getChatRoomByUsersService.execute([
      data.idUser,
      userLogged?._id,
    ]);

    if (!room) {
      room = await createChatRoomService.execute([
        data.idUser,
        userLogged?._id,
      ]);
    }

    socket.join(room.idChatRoom);

    const messages = await getMessagesByChatRoomService.execute(
      room.idChatRoom
    );

    callback({ room, messages });
  });

  socket.on("message", async (data) => {
    // buscar as informações do usuário (socket.id)
    const getUserBySocketIdService = container.resolve(
      GetUserBySocketIdService
    );
    const createMessageService = container.resolve(CreateMessageService);
    const getChatRoomByIdService = container.resolve(GetChatRoomByIdService);

    const user = await getUserBySocketIdService.execute(socket.id);

    // salvar a mensagem
    const message = await createMessageService.execute({
      to: user?._id,
      text: data.message,
      roomId: data.idChatRoom,
    });

    // enviar a mensagem pra outros usuários da sala
    io.to(data.idChatRoom).emit("message", {
      message,
      user,
    });

    // enviar notificação pro usuário correto
    const room = await getChatRoomByIdService.execute(data.idChatRoom);

    const userFrom = room?.idUsers.find(
      (response) => String(response._id) !== String(user?._id)
    );

    io.to(userFrom?.socket_id as string).emit("notification", {
      newMessage: true,
      roomId: data.idChatRoom,
      from: user,
    });
  });
});
